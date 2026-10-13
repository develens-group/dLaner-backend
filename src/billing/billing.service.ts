import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { CreditService } from '../credits/credit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPlansService } from './billing-plans.service';
import { BillingStorageService } from './billing-storage.service';
import { serializePlan } from './subscription-plans';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: BillingPlansService,
    private readonly storage: BillingStorageService,
    private readonly credits: CreditService,
  ) {}

  async me(userId: string) {
    const effectivePlan = await this.plans.resolveEffectivePlan(userId);
    if (effectivePlan.slug === 'free') {
      await this.credits
        .grantPromotionCredits(
          userId,
          effectivePlan.includedCreditAmount,
          `free-starter:${userId}`,
          'FREE_PLAN',
          effectivePlan.id,
          'Free plan starter credits',
        )
        .catch(() => undefined);
    }

    const [user, storage, balance, subscription] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, plan: true, email: true, displayName: true },
      }),
      this.storage.usage(userId),
      this.credits.getBalance(userId),
      this.prisma.userSubscription.findFirst({
        where: {
          userId,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: { gt: new Date() },
        },
        include: { plan: true },
        orderBy: { currentPeriodEnd: 'desc' },
      }),
    ]);

    return {
      user: {
        id: user.id,
        plan: user.plan,
        email: user.email,
        displayName: user.displayName,
      },
      plan: serializePlan(effectivePlan),
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart.toISOString(),
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            plan: serializePlan(subscription.plan),
          }
        : null,
      storage,
      credits: balance,
    };
  }
}
