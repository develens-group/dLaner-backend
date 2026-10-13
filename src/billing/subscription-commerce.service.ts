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
  SubscriptionInterval,
  SubscriptionStatus,
} from '@prisma/client';
import { CreditService } from '../credits/credit.service';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry';
import {
  sanitizePayload,
  stablePayloadHash,
} from '../request-tracking/sanitizer';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPlansService } from './billing-plans.service';
import { addPeriod } from './subscription-plans';

@Injectable()
export class SubscriptionCommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly providers: PaymentProviderRegistry,
    private readonly plans: BillingPlansService,
    private readonly credits: CreditService,
  ) {}

  async createOrder(userId: string, planId: string, key: string) {
    this.assertEnabled();
    if (!validKey(key))
      throw new UnprocessableEntityException('Invalid Idempotency-Key');
    const requestHash = stablePayloadHash({ planId });
    const existing = await this.prisma.subscriptionOrder.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ConflictException('Idempotency key conflict');
      return existing;
    }
    const plan = await this.plans.getById(planId);
    if (!plan.interval || plan.priceMinor <= 0)
      throw new ForbiddenException('Free plan cannot be purchased');
    return this.prisma.subscriptionOrder.create({
      data: {
        userId,
        planId: plan.id,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        paymentProvider: this.config.get('PAYMENT_PROVIDER', 'mock'),
        idempotencyKey: key,
        requestHash,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  }

  async startPayment(userId: string, orderId: string) {
    this.assertEnabled();
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
      this.prisma.subscriptionPaymentAttempt.create({
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
      this.prisma.subscriptionOrder.update({
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

  ownedOrder(userId: string, id: string) {
    return this.prisma.subscriptionOrder.findFirstOrThrow({
      where: { id, userId },
      include: { plan: true, paymentAttempts: true },
    });
  }

  /**
   * Returns null when the orderId is not a subscription order
   * (so the credit webhook path can handle it).
   */
  async tryProcessWebhook(
    providerName: string,
    payload: unknown,
    signature?: string,
  ) {
    this.assertEnabled();
    const provider = this.providers.get(providerName);
    let parsed;
    try {
      parsed = provider.parseWebhook(payload, signature);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid webhook');
    }
    const order = await this.prisma.subscriptionOrder.findUnique({
      where: { id: parsed.orderId },
      include: { plan: true },
    });
    if (!order) return null;
    if (
      order.paymentProvider !== providerName ||
      order.providerPaymentId !== parsed.providerPaymentId
    )
      throw new UnprocessableEntityException('Payment verification failed');

    const payloadHash = stablePayloadHash(payload);
    const prior = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: providerName,
          providerEventId: parsed.providerEventId,
        },
      },
    });
    if (prior?.processedAt)
      return { processed: true, duplicate: true, kind: 'subscription' as const };

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

    const verification = await provider.verifyPayment({
      providerPaymentId: parsed.providerPaymentId,
      orderId: order.id,
      amountMinor: order.priceMinor,
      currency: order.currency,
    });

    if (!parsed.successful || !verification.successful) {
      await this.prisma.$transaction([
        this.prisma.subscriptionOrder.update({
          where: { id: order.id },
          data: { status: CreditOrderStatus.FAILED, failedAt: new Date() },
        }),
        this.prisma.subscriptionPaymentAttempt.updateMany({
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
      return {
        processed: true,
        paid: false,
        kind: 'subscription' as const,
      };
    }

    await this.activatePaidOrder(
      order.id,
      parsed.providerPaymentId,
      event.id,
    );
    return {
      processed: true,
      paid: true,
      kind: 'subscription' as const,
      orderId: order.id,
    };
  }

  async activatePaidOrder(
    orderId: string,
    providerPaymentId: string,
    webhookEventId?: string,
  ) {
    const order = await this.prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { plan: true },
    });
    if (order.status === CreditOrderStatus.PAID) return order;
    if (
      order.status !== CreditOrderStatus.PENDING_PAYMENT &&
      order.status !== CreditOrderStatus.CREATED
    )
      throw new ConflictException('Order cannot be paid');
    if (!order.plan.interval)
      throw new ConflictException('Plan has no billing interval');

    const periodStart = new Date();
    const periodEnd = addPeriod(
      periodStart,
      order.plan.interval as SubscriptionInterval,
    );
    const creditKey = `sub:${order.id}:${periodStart.toISOString().slice(0, 10)}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.userSubscription.updateMany({
        where: { userId: order.userId, status: SubscriptionStatus.ACTIVE },
        data: { status: SubscriptionStatus.CANCELED, cancelAtPeriodEnd: true },
      });
      await tx.userSubscription.create({
        data: {
          userId: order.userId,
          planId: order.planId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          creditsGrantedForKey: creditKey,
        },
      });
      await tx.user.update({
        where: { id: order.userId },
        data: { plan: order.plan.userPlan },
      });
      await tx.subscriptionOrder.update({
        where: { id: order.id },
        data: {
          status: CreditOrderStatus.PAID,
          paidAt: new Date(),
          providerPaymentId,
        },
      });
      await tx.subscriptionPaymentAttempt.updateMany({
        where: { orderId, providerPaymentId },
        data: { status: PaymentAttemptStatus.SUCCEEDED },
      });
      if (webhookEventId)
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEventId },
          data: { processedAt: new Date() },
        });
    });

    const included = order.plan.includedCreditAmount;
    if (included && Number(included) > 0) {
      await this.credits.grantPromotionCredits(
        order.userId,
        included,
        creditKey,
        'SUBSCRIPTION_ORDER',
        order.id,
        `${order.plan.name} included credits`,
      );
    }
    return this.prisma.subscriptionOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { plan: true },
    });
  }

  private assertEnabled() {
    if (this.config.get('SUBSCRIPTION_PURCHASE_ENABLED', 'true') !== 'true')
      throw new ForbiddenException('Subscription purchases are disabled');
  }
}

function validKey(key?: string): key is string {
  return !!key && /^[A-Za-z0-9._:-]{8,128}$/.test(key);
}
