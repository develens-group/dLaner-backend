import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreditLedgerType,
  CreditReservationStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { stablePayloadHash } from '../request-tracking/sanitizer';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
interface Mutation {
  userId: string;
  amount: number;
  availableDelta: number;
  reservedDelta: number;
  type: CreditLedgerType;
  idempotencyKey: string;
  referenceType: string;
  referenceId?: string;
  description?: string;
  createdByUserId?: string;
  lifetimePurchasedDelta?: number;
  lifetimeConsumedDelta?: number;
}

@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  getOrCreateAccount(userId: string, tx: Tx = this.prisma) {
    return tx.creditAccount.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }
  async getBalance(userId: string) {
    const account = await this.getOrCreateAccount(userId);
    return {
      available: account.availableBalance,
      reserved: account.reservedBalance,
      total: account.availableBalance + account.reservedBalance,
      lifetimePurchased: account.lifetimePurchased,
      lifetimeConsumed: account.lifetimeConsumed,
      version: account.version,
    };
  }
  grantCredits(
    userId: string,
    amount: number,
    key: string,
    referenceType: string,
    referenceId?: string,
    actorId?: string,
    description?: string,
    purchase = false,
  ) {
    return this.mutate({
      userId,
      amount,
      availableDelta: amount,
      reservedDelta: 0,
      type: purchase ? CreditLedgerType.PURCHASE : CreditLedgerType.ADMIN_GRANT,
      idempotencyKey: key,
      referenceType,
      referenceId,
      createdByUserId: actorId,
      description,
      lifetimePurchasedDelta: purchase ? amount : 0,
    });
  }
  deductCredits(
    userId: string,
    amount: number,
    key: string,
    actorId: string,
    description: string,
    referenceId?: string,
  ) {
    return this.mutate({
      userId,
      amount,
      availableDelta: -amount,
      reservedDelta: 0,
      type: CreditLedgerType.ADMIN_DEDUCTION,
      idempotencyKey: key,
      referenceType: 'ADMIN_ADJUSTMENT',
      referenceId,
      createdByUserId: actorId,
      description,
    });
  }
  consumeCredits(
    userId: string,
    amount: number,
    key: string,
    referenceType: string,
    referenceId?: string,
  ) {
    return this.mutate({
      userId,
      amount,
      availableDelta: -amount,
      reservedDelta: 0,
      type: CreditLedgerType.CONSUMPTION,
      idempotencyKey: key,
      referenceType,
      referenceId,
      lifetimeConsumedDelta: amount,
    });
  }
  refundCredits(
    userId: string,
    amount: number,
    key: string,
    actorId: string | undefined,
    referenceType: string,
    referenceId: string,
    description?: string,
  ) {
    return this.mutate({
      userId,
      amount,
      availableDelta: amount,
      reservedDelta: 0,
      type: CreditLedgerType.REFUND,
      idempotencyKey: key,
      referenceType,
      referenceId,
      createdByUserId: actorId,
      description,
    });
  }
  async refundPurchase(
    userId: string,
    orderId: string,
    amount: number,
    key: string,
    actorId: string,
    description: string,
  ) {
    this.assertAmount(amount);
    const requestHash = stablePayloadHash({ orderId, amount });
    return this.serializable(async (tx) => {
      const prior = await tx.creditLedgerEntry.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId,
            type: CreditLedgerType.REFUND,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException('Idempotency key conflict');
        return prior;
      }
      const order = await tx.creditPurchaseOrder.findFirst({
        where: {
          id: orderId,
          userId,
          status: { in: ['PAID', 'REFUNDED'] },
        },
      });
      if (!order) throw new NotFoundException('Paid credit order not found');
      const refunded = await tx.creditLedgerEntry.aggregate({
        where: {
          userId,
          type: CreditLedgerType.REFUND,
          referenceType: 'CREDIT_ORDER',
          referenceId: orderId,
        },
        _sum: { amount: true },
      });
      const alreadyRefunded = refunded._sum.amount ?? 0;
      if (alreadyRefunded + amount > order.totalCreditAmount)
        throw new UnprocessableEntityException(
          'Refund exceeds purchased credits',
        );
      const account = await this.getOrCreateAccount(userId, tx);
      const changed = await tx.creditAccount.updateMany({
        where: { id: account.id, version: account.version },
        data: {
          availableBalance: { increment: amount },
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException('Concurrent credit operation; retry');
      const entry = await tx.creditLedgerEntry.create({
        data: {
          accountId: account.id,
          userId,
          type: CreditLedgerType.REFUND,
          amount,
          availableDelta: amount,
          reservedDelta: 0,
          availableBalanceAfter: account.availableBalance + amount,
          reservedBalanceAfter: account.reservedBalance,
          referenceType: 'CREDIT_ORDER',
          referenceId: orderId,
          idempotencyKey: key,
          requestHash,
          description,
          createdByUserId: actorId,
        },
      });
      if (alreadyRefunded + amount === order.totalCreditAmount)
        await tx.creditPurchaseOrder.update({
          where: { id: orderId },
          data: { status: 'REFUNDED' },
        });
      return entry;
    });
  }
  async completePurchase(
    orderId: string,
    key: string,
    providerPaymentId: string,
    webhookEventId?: string,
  ) {
    return this.serializable(async (tx) => {
      const order = await tx.creditPurchaseOrder.findUnique({
        where: { id: orderId },
      });
      if (!order) throw new NotFoundException('Credit order not found');
      const prior = await tx.creditLedgerEntry.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId: order.userId,
            type: CreditLedgerType.PURCHASE,
            idempotencyKey: key,
          },
        },
      });
      if (prior) return { order, ledgerEntry: prior };
      if (order.status === 'PAID')
        throw new ConflictException('Paid order is missing its ledger entry');
      if (order.status !== 'PENDING_PAYMENT' && order.status !== 'CREATED')
        throw new ConflictException('Order cannot be paid');
      const account = await this.getOrCreateAccount(order.userId, tx);
      const changed = await tx.creditAccount.updateMany({
        where: { id: account.id, version: account.version },
        data: {
          availableBalance: { increment: order.totalCreditAmount },
          lifetimePurchased: { increment: order.totalCreditAmount },
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException('Concurrent credit operation; retry');
      const ledgerEntry = await tx.creditLedgerEntry.create({
        data: {
          accountId: account.id,
          userId: order.userId,
          type: CreditLedgerType.PURCHASE,
          amount: order.totalCreditAmount,
          availableDelta: order.totalCreditAmount,
          reservedDelta: 0,
          availableBalanceAfter:
            account.availableBalance + order.totalCreditAmount,
          reservedBalanceAfter: account.reservedBalance,
          referenceType: 'CREDIT_ORDER',
          referenceId: order.id,
          idempotencyKey: key,
          requestHash: stablePayloadHash({
            orderId,
            providerPaymentId,
            amount: order.priceMinor,
          }),
        },
      });
      const paidOrder = await tx.creditPurchaseOrder.update({
        where: { id: order.id },
        data: { status: 'PAID', paidAt: new Date(), providerPaymentId },
      });
      await tx.paymentAttempt.updateMany({
        where: { orderId, providerPaymentId },
        data: { status: 'SUCCEEDED' },
      });
      if (webhookEventId)
        await tx.paymentWebhookEvent.update({
          where: { id: webhookEventId },
          data: { processedAt: new Date() },
        });
      return { order: paidOrder, ledgerEntry };
    });
  }
  async reserveCredits(
    userId: string,
    amount: number,
    key: string,
    referenceType: string,
    referenceId: string,
  ) {
    this.assertAmount(amount);
    const requestHash = stablePayloadHash({
      amount,
      referenceType,
      referenceId,
    });
    return this.serializable(async (tx) => {
      const prior = await tx.creditReservation.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException('Idempotency key conflict');
        return prior;
      }
      const account = await this.getOrCreateAccount(userId, tx);
      const changed = await tx.creditAccount.updateMany({
        where: {
          id: account.id,
          version: account.version,
          availableBalance: { gte: amount },
        },
        data: {
          availableBalance: { decrement: amount },
          reservedBalance: { increment: amount },
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new UnprocessableEntityException(
          'Insufficient available credits',
        );
      const reservation = await tx.creditReservation.create({
        data: {
          accountId: account.id,
          userId,
          amount,
          idempotencyKey: key,
          requestHash,
          referenceType,
          referenceId,
          expiresAt: new Date(
            Date.now() +
              this.config.get<number>('CREDIT_RESERVATION_TTL_SECONDS', 900) *
                1000,
          ),
        },
      });
      await tx.creditLedgerEntry.create({
        data: {
          accountId: account.id,
          userId,
          type: CreditLedgerType.RESERVATION,
          amount,
          availableDelta: -amount,
          reservedDelta: amount,
          availableBalanceAfter: account.availableBalance - amount,
          reservedBalanceAfter: account.reservedBalance + amount,
          referenceType: 'CREDIT_RESERVATION',
          referenceId: reservation.id,
          idempotencyKey: key,
          requestHash,
        },
      });
      return reservation;
    });
  }
  async captureReservation(
    userId: string,
    reservationId: string,
    actualAmount: number,
    key: string,
  ) {
    this.assertAmount(actualAmount);
    const requestHash = stablePayloadHash({ reservationId, actualAmount });
    return this.serializable(async (tx) => {
      const prior = await tx.creditLedgerEntry.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId,
            type: CreditLedgerType.RESERVATION_CAPTURE,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException('Idempotency key conflict');
        return tx.creditReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      }
      const reservation = await tx.creditReservation.findFirst({
        where: { id: reservationId, userId },
        include: { account: true },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (reservation.status !== CreditReservationStatus.ACTIVE)
        throw new ConflictException('Reservation is no longer active');
      if (reservation.expiresAt && reservation.expiresAt <= new Date())
        throw new ConflictException('Reservation has expired');
      if (actualAmount > reservation.amount)
        throw new UnprocessableEntityException('Capture exceeds reservation');
      const remainder = reservation.amount - actualAmount;
      const changed = await tx.creditAccount.updateMany({
        where: {
          id: reservation.accountId,
          version: reservation.account.version,
          reservedBalance: { gte: reservation.amount },
        },
        data: {
          reservedBalance: { decrement: reservation.amount },
          availableBalance: { increment: remainder },
          lifetimeConsumed: { increment: actualAmount },
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException('Concurrent credit operation; retry');
      const intermediateReserved =
        reservation.account.reservedBalance - actualAmount;
      await tx.creditLedgerEntry.create({
        data: {
          accountId: reservation.accountId,
          userId,
          type: CreditLedgerType.RESERVATION_CAPTURE,
          amount: actualAmount,
          availableDelta: 0,
          reservedDelta: -actualAmount,
          availableBalanceAfter: reservation.account.availableBalance,
          reservedBalanceAfter: intermediateReserved,
          referenceType: 'CREDIT_RESERVATION',
          referenceId: reservation.id,
          idempotencyKey: key,
          requestHash,
        },
      });
      if (remainder > 0)
        await tx.creditLedgerEntry.create({
          data: {
            accountId: reservation.accountId,
            userId,
            type: CreditLedgerType.RESERVATION_RELEASE,
            amount: remainder,
            availableDelta: remainder,
            reservedDelta: -remainder,
            availableBalanceAfter:
              reservation.account.availableBalance + remainder,
            reservedBalanceAfter:
              reservation.account.reservedBalance - reservation.amount,
            referenceType: 'CREDIT_RESERVATION',
            referenceId: reservation.id,
            idempotencyKey: `${key}:remainder`,
            requestHash,
          },
        });
      return tx.creditReservation.update({
        where: { id: reservation.id },
        data: {
          status: CreditReservationStatus.CAPTURED,
          capturedAmount: actualAmount,
          capturedAt: new Date(),
          releasedAt: remainder ? new Date() : undefined,
        },
      });
    });
  }
  async releaseReservation(userId: string, reservationId: string, key: string) {
    const requestHash = stablePayloadHash({ reservationId });
    return this.serializable(async (tx) => {
      const prior = await tx.creditLedgerEntry.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId,
            type: CreditLedgerType.RESERVATION_RELEASE,
            idempotencyKey: key,
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException('Idempotency key conflict');
        return tx.creditReservation.findUniqueOrThrow({
          where: { id: reservationId },
        });
      }
      const reservation = await tx.creditReservation.findFirst({
        where: { id: reservationId, userId },
        include: { account: true },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (reservation.status !== CreditReservationStatus.ACTIVE)
        throw new ConflictException('Reservation is no longer active');
      const changed = await tx.creditAccount.updateMany({
        where: {
          id: reservation.accountId,
          version: reservation.account.version,
          reservedBalance: { gte: reservation.amount },
        },
        data: {
          reservedBalance: { decrement: reservation.amount },
          availableBalance: { increment: reservation.amount },
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException('Concurrent credit operation; retry');
      await tx.creditLedgerEntry.create({
        data: {
          accountId: reservation.accountId,
          userId,
          type: CreditLedgerType.RESERVATION_RELEASE,
          amount: reservation.amount,
          availableDelta: reservation.amount,
          reservedDelta: -reservation.amount,
          availableBalanceAfter:
            reservation.account.availableBalance + reservation.amount,
          reservedBalanceAfter:
            reservation.account.reservedBalance - reservation.amount,
          referenceType: 'CREDIT_RESERVATION',
          referenceId: reservation.id,
          idempotencyKey: key,
          requestHash,
        },
      });
      return tx.creditReservation.update({
        where: { id: reservation.id },
        data: {
          status: CreditReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });
    });
  }
  async rebuildBalanceFromLedger(
    userId: string,
    repair = false,
    actorId?: string,
  ) {
    const account = await this.getOrCreateAccount(userId);
    const sums = await this.prisma.creditLedgerEntry.aggregate({
      where: { userId },
      _sum: { availableDelta: true, reservedDelta: true },
    });
    const calculated = {
      available: sums._sum.availableDelta ?? 0,
      reserved: sums._sum.reservedDelta ?? 0,
    };
    const matches =
      calculated.available === account.availableBalance &&
      calculated.reserved === account.reservedBalance;
    if (repair && !matches) {
      if (!actorId)
        throw new ConflictException('Repair requires an administrator');
      await this.serializable(async (tx) => {
        const changed = await tx.creditAccount.updateMany({
          where: { id: account.id, version: account.version },
          data: {
            availableBalance: calculated.available,
            reservedBalance: calculated.reserved,
            version: { increment: 1 },
          },
        });
        if (!changed.count)
          throw new ConflictException('Concurrent credit operation; retry');
        await tx.auditLog.create({
          data: {
            action: 'credit.reconciliation_repaired',
            actorId,
            targetType: 'CreditAccount',
            targetId: account.id,
            metadata: {
              beforeAvailable: account.availableBalance,
              beforeReserved: account.reservedBalance,
              afterAvailable: calculated.available,
              afterReserved: calculated.reserved,
            },
          },
        });
      });
    }
    return {
      cached: {
        available: account.availableBalance,
        reserved: account.reservedBalance,
      },
      calculated,
      matches,
      repaired: repair && !matches,
    };
  }
  async expireReservations() {
    const expired = await this.prisma.creditReservation.findMany({
      where: {
        status: CreditReservationStatus.ACTIVE,
        expiresAt: { lte: new Date() },
      },
      select: { id: true, userId: true },
      take: 1000,
    });
    for (const reservation of expired) {
      await this.releaseReservation(
        reservation.userId,
        reservation.id,
        `expire:${reservation.id}`,
      );
      await this.prisma.creditReservation.updateMany({
        where: {
          id: reservation.id,
          status: CreditReservationStatus.RELEASED,
        },
        data: { status: CreditReservationStatus.EXPIRED },
      });
    }
    return { count: expired.length, batchLimited: expired.length === 1000 };
  }
  private async mutate(input: Mutation) {
    this.assertAmount(input.amount);
    const requestHash = stablePayloadHash({
      amount: input.amount,
      availableDelta: input.availableDelta,
      reservedDelta: input.reservedDelta,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    });
    return this.serializable(async (tx) => {
      const prior = await tx.creditLedgerEntry.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId: input.userId,
            type: input.type,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException('Idempotency key conflict');
        return prior;
      }
      const account = await this.getOrCreateAccount(input.userId, tx);
      const nextAvailable = account.availableBalance + input.availableDelta;
      const nextReserved = account.reservedBalance + input.reservedDelta;
      if (nextAvailable < 0 || nextReserved < 0)
        throw new UnprocessableEntityException('Insufficient credits');
      const changed = await tx.creditAccount.updateMany({
        where: { id: account.id, version: account.version },
        data: {
          availableBalance: { increment: input.availableDelta },
          reservedBalance: { increment: input.reservedDelta },
          lifetimePurchased: { increment: input.lifetimePurchasedDelta ?? 0 },
          lifetimeConsumed: { increment: input.lifetimeConsumedDelta ?? 0 },
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException('Concurrent credit operation; retry');
      return tx.creditLedgerEntry.create({
        data: {
          accountId: account.id,
          userId: input.userId,
          type: input.type,
          amount: input.amount,
          availableDelta: input.availableDelta,
          reservedDelta: input.reservedDelta,
          availableBalanceAfter: nextAvailable,
          reservedBalanceAfter: nextReserved,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          description: input.description,
          createdByUserId: input.createdByUserId,
        },
      });
    });
  }
  private assertAmount(amount: number) {
    const max = this.config.get<number>(
      'CREDIT_MAX_TRANSACTION_AMOUNT',
      1_000_000_000,
    );
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > max)
      throw new UnprocessableEntityException('Invalid credit amount');
  }
  private async serializable<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (attempt === 3 || !isRetryable(error)) throw error;
      }
    }
    throw new ConflictException('Credit operation could not be completed');
  }
}
function isRetryable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2034', 'P2002'].includes(error.code)
  );
}
