import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreditOrderStatus,
  PaymentAttemptStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry';
import { PrismaService } from '../prisma/prisma.service';
import {
  sanitizePayload,
  stablePayloadHash,
} from '../request-tracking/sanitizer';
import {
  CreditPackageDto,
  CursorDto,
  LedgerQueryDto,
  OrderQueryDto,
  ReservationQueryDto,
  UpdateCreditPackageDto,
} from './credits.dto';
import { CreditService } from './credit.service';

@Injectable()
export class CreditCommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditService,
    private readonly providers: PaymentProviderRegistry,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}
  packages(admin = false) {
    const now = new Date();
    return this.prisma.creditPackage.findMany({
      where: admin
        ? {}
        : {
            isActive: true,
            deletedAt: null,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }
  createPackage(dto: CreditPackageDto) {
    return this.prisma.creditPackage.create({
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }
  updatePackage(id: string, dto: UpdateCreditPackageDto) {
    return this.prisma.creditPackage.update({
      where: { id },
      data: dto,
    });
  }
  deletePackage(id: string) {
    return this.prisma.creditPackage.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }
  async createOrder(userId: string, packageId: string, key: string) {
    if (!validKey(key))
      throw new UnprocessableEntityException('Invalid Idempotency-Key');
    const requestHash = stablePayloadHash({ packageId });
    const existing = await this.prisma.creditPurchaseOrder.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ConflictException('Idempotency key conflict');
      return existing;
    }
    return this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const pkg = await tx.creditPackage.findFirst({
          where: {
            id: packageId,
            isActive: true,
            deletedAt: null,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
        });
        if (!pkg)
          throw new NotFoundException('Active credit package not found');
        if (pkg.purchaseLimitPerUser) {
          const count = await tx.creditPurchaseOrder.count({
            where: { userId, packageId, status: CreditOrderStatus.PAID },
          });
          if (count >= pkg.purchaseLimitPerUser)
            throw new ForbiddenException('Package purchase limit reached');
        }
        return tx.creditPurchaseOrder.create({
          data: {
            userId,
            packageId,
            creditAmount: pkg.creditAmount,
            bonusCreditAmount: pkg.bonusCreditAmount,
            totalCreditAmount: pkg.creditAmount + pkg.bonusCreditAmount,
            priceMinor: pkg.priceMinor,
            currency: pkg.currency,
            paymentProvider: this.config.get('PAYMENT_PROVIDER', 'mock'),
            idempotencyKey: key,
            requestHash,
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async startPayment(userId: string, orderId: string) {
    const order = await this.ownedOrder(userId, orderId);
    if (order.status === CreditOrderStatus.PAID)
      return { order, alreadyPaid: true };
    if (
      order.status !== CreditOrderStatus.CREATED &&
      order.status !== CreditOrderStatus.PENDING_PAYMENT
    )
      throw new ConflictException('Order cannot start payment');
    if (order.expiresAt && order.expiresAt <= new Date())
      throw new ConflictException('Order has expired');
    const provider = this.providers.get(order.paymentProvider);
    const result = await provider.createPayment({
      orderId: order.id,
      amountMinor: order.priceMinor,
      currency: order.currency,
      returnUrl: this.config.getOrThrow('PAYMENT_RETURN_URL'),
      cancelUrl: this.config.getOrThrow('PAYMENT_CANCEL_URL'),
    });
    await this.prisma.$transaction([
      this.prisma.paymentAttempt.create({
        data: {
          orderId,
          provider: provider.name,
          providerPaymentId: result.providerPaymentId,
          status: PaymentAttemptStatus.PENDING,
          amountMinor: order.priceMinor,
          currency: order.currency,
          responseJson: sanitizePayload(result.safeResponse ?? {}, 4096)
            .value as Prisma.InputJsonValue,
        },
      }),
      this.prisma.creditPurchaseOrder.update({
        where: { id: orderId },
        data: {
          status: CreditOrderStatus.PENDING_PAYMENT,
          providerPaymentId: result.providerPaymentId,
        },
      }),
    ]);
    return {
      orderId,
      provider: provider.name,
      providerPaymentId: result.providerPaymentId,
      redirectUrl: result.redirectUrl,
    };
  }
  async cancelOrder(userId: string, orderId: string) {
    await this.ownedOrder(userId, orderId);
    const changed = await this.prisma.creditPurchaseOrder.updateMany({
      where: {
        id: orderId,
        userId,
        status: {
          in: [CreditOrderStatus.CREATED, CreditOrderStatus.PENDING_PAYMENT],
        },
      },
      data: { status: CreditOrderStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (!changed.count)
      throw new ConflictException('Order cannot be cancelled');
    return this.ownedOrder(userId, orderId);
  }
  async processWebhook(
    providerName: string,
    payload: unknown,
    signature?: string,
  ) {
    const provider = this.providers.get(providerName);
    const payloadHash = stablePayloadHash(payload);
    let parsed;
    try {
      parsed = provider.parseWebhook(payload, signature);
    } catch (error) {
      await this.prisma.paymentWebhookEvent.upsert({
        where: {
          provider_providerEventId: {
            provider: providerName,
            providerEventId: `invalid:${payloadHash}`,
          },
        },
        create: {
          provider: providerName,
          providerEventId: `invalid:${payloadHash}`,
          eventType: 'invalid',
          signatureValid: false,
          payloadHash,
        },
        update: {},
      });
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid webhook');
    }
    const prior = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: providerName,
          providerEventId: parsed.providerEventId,
        },
      },
    });
    if (prior?.processedAt) return { processed: true, duplicate: true };
    const event =
      prior ??
      (await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: providerName,
          providerEventId: parsed.providerEventId,
          eventType: parsed.eventType,
          signatureValid: true,
          payloadHash,
          payloadJson: sanitizePayload(parsed.payload, 8192)
            .value as Prisma.InputJsonValue,
        },
      }));
    const order = await this.prisma.creditPurchaseOrder.findUnique({
      where: { id: parsed.orderId },
    });
    if (
      !order ||
      order.paymentProvider !== providerName ||
      order.providerPaymentId !== parsed.providerPaymentId
    )
      throw new UnprocessableEntityException('Payment verification failed');
    const verification = await provider.verifyPayment({
      providerPaymentId: parsed.providerPaymentId,
      orderId: order.id,
      amountMinor: order.priceMinor,
      currency: order.currency,
    });
    if (!parsed.successful || !verification.successful) {
      await this.prisma.$transaction([
        this.prisma.creditPurchaseOrder.update({
          where: { id: order.id },
          data: { status: CreditOrderStatus.FAILED, failedAt: new Date() },
        }),
        this.prisma.paymentAttempt.updateMany({
          where: {
            orderId: order.id,
            providerPaymentId: parsed.providerPaymentId,
          },
          data: {
            status: PaymentAttemptStatus.FAILED,
            failureCode: verification.failureCode ?? 'PAYMENT_FAILED',
          },
        }),
        this.prisma.paymentWebhookEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        }),
      ]);
      return { processed: true, paid: false };
    }
    const result = await this.credits.completePurchase(
      order.id,
      `payment:${providerName}:${parsed.providerEventId}`,
      parsed.providerPaymentId,
      event.id,
    );
    this.audit.record(
      'credit_order.paid',
      order.userId,
      order.id,
      'CreditPurchaseOrder',
      {
        provider: providerName,
        amountMinor: order.priceMinor,
        currency: order.currency,
      },
    );
    return { processed: true, paid: true, orderId: result.order.id };
  }
  ledger(userId: string, query: LedgerQueryDto) {
    return this.page(
      'creditLedgerEntry',
      { userId, type: query.type, createdAt: dates(query) },
      query,
    );
  }
  reservations(userId: string, query: ReservationQueryDto) {
    return this.page(
      'creditReservation',
      { userId, status: query.status, createdAt: dates(query) },
      query,
    );
  }
  orders(userId: string | undefined, query: OrderQueryDto) {
    return this.page(
      'creditPurchaseOrder',
      { userId, status: query.status, createdAt: dates(query) },
      query,
    );
  }
  ownedOrder(userId: string, id: string) {
    return this.prisma.creditPurchaseOrder.findFirstOrThrow({
      where: { id, userId },
      include: { paymentAttempts: true, package: true },
    });
  }
  async adminOrder(id: string) {
    const order = await this.prisma.creditPurchaseOrder.findUnique({
      where: { id },
      include: {
        paymentAttempts: true,
        package: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    if (!order) throw new NotFoundException('Credit order not found');
    return order;
  }
  adminAccounts(query: CursorDto) {
    return this.page('creditAccount', {}, query);
  }
  async adminAccount(userId: string) {
    const account = await this.credits.getOrCreateAccount(userId);
    return { account, balance: await this.credits.getBalance(userId) };
  }
  private async page(
    model:
      | 'creditLedgerEntry'
      | 'creditReservation'
      | 'creditPurchaseOrder'
      | 'creditAccount',
    where: Record<string, unknown>,
    query: CursorDto,
  ) {
    const delegate = this.prisma[model] as unknown as {
      findMany(args: Record<string, unknown>): Promise<Array<{ id: string }>>;
    };
    const items = await delegate.findMany({
      where,
      take: query.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > query.limit;
    if (hasMore) items.pop();
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }
}
function dates(query: CursorDto) {
  return query.from || query.to
    ? {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      }
    : undefined;
}
function validKey(key?: string): key is string {
  return !!key && /^[A-Za-z0-9._:-]{8,128}$/.test(key);
}
