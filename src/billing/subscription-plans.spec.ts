import { SubscriptionInterval } from '@prisma/client';
import { addPeriod, SUBSCRIPTION_PLAN_SEEDS } from './subscription-plans';

describe('subscription-plans', () => {
  it('defines only Free + Creator + Studio SKUs', () => {
    const names = new Set(SUBSCRIPTION_PLAN_SEEDS.map((p) => p.name));
    expect([...names].sort()).toEqual(['Creator', 'Free', 'Studio']);
    expect(SUBSCRIPTION_PLAN_SEEDS).toHaveLength(5);
  });

  it('adds one month or one year for period ends', () => {
    const start = new Date('2026-01-15T00:00:00.000Z');
    expect(addPeriod(start, SubscriptionInterval.MONTHLY).toISOString()).toBe(
      '2026-02-15T00:00:00.000Z',
    );
    expect(addPeriod(start, SubscriptionInterval.YEARLY).toISOString()).toBe(
      '2027-01-15T00:00:00.000Z',
    );
  });
});
