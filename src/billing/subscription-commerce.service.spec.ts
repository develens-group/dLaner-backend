import {
  CreditOrderStatus,
  SubscriptionInterval,
  SubscriptionStatus,
  UserPlan,
} from '@prisma/client';
import { SubscriptionCommerceService } from './subscription-commerce.service';

describe('SubscriptionCommerceService', () => {
  const prisma = {
    subscriptionOrder: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    subscriptionPaymentAttempt: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    userSubscription: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    user: { update: jest.fn() },
    paymentWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'SUBSCRIPTION_PURCHASE_ENABLED') return 'true';
      if (key === 'PAYMENT_PROVIDER') return 'mock';
      return fallback;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'PAYMENT_RETURN_URL') return 'http://localhost/return';
      if (key === 'PAYMENT_CANCEL_URL') return 'http://localhost/cancel';
      return '';
    }),
  };
  const providers = {
    get: jest.fn(() => ({
      name: 'mock',
      createPayment: jest.fn(async () => ({
        providerPaymentId: 'mock_pay_1',
        redirectUrl: 'http://pay',
        safeResponse: {},
      })),
      parseWebhook: jest.fn(),
      verifyPayment: jest.fn(),
    })),
  };
  const plans = {
    getById: jest.fn(),
  };
  const credits = {
    grantPromotionCredits: jest.fn(),
  };

  const service = new SubscriptionCommerceService(
    prisma as never,
    config as never,
    providers as never,
    plans as never,
    credits as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  it('rejects purchasing the free plan', async () => {
    plans.getById.mockResolvedValue({
      id: 'plan-free',
      interval: null,
      priceMinor: 0,
    });
    await expect(
      service.createOrder('u1', 'plan-free', 'idem-key-1'),
    ).rejects.toMatchObject({ message: 'Free plan cannot be purchased' });
  });

  it('activates subscription, upgrades User.plan, and grants included credits', async () => {
    const plan = {
      id: 'plan-creator',
      name: 'Creator',
      userPlan: UserPlan.PRO,
      interval: SubscriptionInterval.MONTHLY,
      includedCreditAmount: 50,
    };
    prisma.subscriptionOrder.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'ord-1',
        userId: 'u1',
        planId: plan.id,
        status: CreditOrderStatus.PENDING_PAYMENT,
        plan,
      })
      .mockResolvedValueOnce({
        id: 'ord-1',
        userId: 'u1',
        planId: plan.id,
        status: CreditOrderStatus.PAID,
        plan,
      });

    await service.activatePaidOrder('ord-1', 'mock_pay_1');

    expect(prisma.userSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { plan: UserPlan.PRO },
    });
    expect(credits.grantPromotionCredits).toHaveBeenCalledWith(
      'u1',
      50,
      expect.stringMatching(/^sub:ord-1:/),
      'SUBSCRIPTION_ORDER',
      'ord-1',
      expect.any(String),
    );
  });
});
