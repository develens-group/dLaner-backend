import {
  SubscriptionInterval,
  UserPlan,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

export type PlanSeed = {
  slug: string;
  name: string;
  description: string;
  userPlan: UserPlan;
  interval: SubscriptionInterval | null;
  priceMinor: number;
  currency: string;
  storageBytesLimit: bigint;
  includedCreditAmount: Prisma.Decimal;
  sortOrder: number;
};

const MB = 1024n * 1024n;
const GB = 1024n * MB;

/** Canonical few-plan catalog for dLander (Free / Creator / Studio). */
export const SUBSCRIPTION_PLAN_SEEDS: PlanSeed[] = [
  {
    slug: 'free',
    name: 'Free',
    description: 'Starter workspace for exploring dLander',
    userPlan: UserPlan.FREE,
    interval: null,
    priceMinor: 0,
    currency: 'USD',
    storageBytesLimit: 200n * MB,
    includedCreditAmount: new Prisma.Decimal(10),
    sortOrder: 0,
  },
  {
    slug: 'creator-monthly',
    name: 'Creator',
    description: 'For freelancers shipping Lands regularly',
    userPlan: UserPlan.PRO,
    interval: SubscriptionInterval.MONTHLY,
    priceMinor: 1200,
    currency: 'USD',
    storageBytesLimit: 5n * GB,
    includedCreditAmount: new Prisma.Decimal(50),
    sortOrder: 10,
  },
  {
    slug: 'creator-yearly',
    name: 'Creator',
    description: 'Creator billed yearly (2 months free)',
    userPlan: UserPlan.PRO,
    interval: SubscriptionInterval.YEARLY,
    priceMinor: 9900,
    currency: 'USD',
    storageBytesLimit: 5n * GB,
    includedCreditAmount: new Prisma.Decimal(600),
    sortOrder: 11,
  },
  {
    slug: 'studio-monthly',
    name: 'Studio',
    description: 'Teams and heavy AI + storage use',
    userPlan: UserPlan.ENTERPRISE,
    interval: SubscriptionInterval.MONTHLY,
    priceMinor: 3900,
    currency: 'USD',
    storageBytesLimit: 50n * GB,
    includedCreditAmount: new Prisma.Decimal(200),
    sortOrder: 20,
  },
  {
    slug: 'studio-yearly',
    name: 'Studio',
    description: 'Studio billed yearly (2 months free)',
    userPlan: UserPlan.ENTERPRISE,
    interval: SubscriptionInterval.YEARLY,
    priceMinor: 34900,
    currency: 'USD',
    storageBytesLimit: 50n * GB,
    includedCreditAmount: new Prisma.Decimal(2400),
    sortOrder: 21,
  },
];

export function serializePlan(plan: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  userPlan: UserPlan;
  interval: SubscriptionInterval | null;
  priceMinor: number;
  currency: string;
  storageBytesLimit: bigint | number;
  includedCreditAmount: Prisma.Decimal | string | number;
  isActive: boolean;
  sortOrder: number;
}) {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    userPlan: plan.userPlan,
    interval: plan.interval,
    priceMinor: plan.priceMinor,
    currency: plan.currency,
    storageBytesLimit: String(plan.storageBytesLimit),
    includedCreditAmount: String(plan.includedCreditAmount),
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  };
}

export function addPeriod(
  start: Date,
  interval: SubscriptionInterval,
): Date {
  const end = new Date(start);
  if (interval === SubscriptionInterval.YEARLY) {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end;
}
