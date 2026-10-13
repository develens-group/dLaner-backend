import { Injectable, OnModuleInit } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  serializePlan,
  SUBSCRIPTION_PLAN_SEEDS,
} from './subscription-plans';

@Injectable()
export class BillingPlansService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensurePlans();
  }

  async ensurePlans() {
    for (const seed of SUBSCRIPTION_PLAN_SEEDS) {
      await this.prisma.subscriptionPlan.upsert({
        where: { slug: seed.slug },
        create: {
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          userPlan: seed.userPlan,
          interval: seed.interval,
          priceMinor: seed.priceMinor,
          currency: seed.currency,
          storageBytesLimit: seed.storageBytesLimit,
          includedCreditAmount: seed.includedCreditAmount,
          sortOrder: seed.sortOrder,
          isActive: true,
        },
        update: {
          name: seed.name,
          description: seed.description,
          userPlan: seed.userPlan,
          interval: seed.interval,
          priceMinor: seed.priceMinor,
          currency: seed.currency,
          storageBytesLimit: seed.storageBytesLimit,
          includedCreditAmount: seed.includedCreditAmount,
          sortOrder: seed.sortOrder,
          isActive: true,
        },
      });
    }
  }

  async listPlans(includeFree = true) {
    await this.ensurePlans();
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
    return plans
      .filter((plan) => includeFree || plan.slug !== 'free')
      .map(serializePlan);
  }

  async getBySlug(slug: string) {
    await this.ensurePlans();
    return this.prisma.subscriptionPlan.findFirstOrThrow({
      where: { slug, isActive: true },
    });
  }

  async getById(id: string) {
    return this.prisma.subscriptionPlan.findFirstOrThrow({
      where: { id, isActive: true },
    });
  }

  /** Active paid subscription plan, else Free catalog row matching User.plan. */
  async resolveEffectivePlan(userId: string) {
    await this.ensurePlans();
    const active = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { gt: new Date() },
      },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (active?.plan) return active.plan;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });
    const free = await this.prisma.subscriptionPlan.findFirst({
      where: { slug: 'free', isActive: true },
    });
    if (free && user.plan === 'FREE') return free;

    const byUserPlan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        userPlan: user.plan,
        isActive: true,
        OR: [{ interval: 'MONTHLY' }, { interval: null }],
      },
      orderBy: { sortOrder: 'asc' },
    });
    return byUserPlan ?? free!;
  }
}
