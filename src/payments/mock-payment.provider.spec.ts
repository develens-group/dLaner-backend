import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';

describe('MockPaymentProvider', () => {
  const provider = new MockPaymentProvider(
    new ConfigService({
      PAYMENT_WEBHOOK_SECRET: 'a-secure-development-secret-of-32-characters',
      MOCK_PAYMENT_ENABLED: 'true',
    }),
  );
  it('creates and verifies a mock payment session', async () => {
    const created = await provider.createPayment({
      orderId: 'order',
      amountMinor: 100,
      currency: 'USD',
      returnUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
    });
    expect(created.redirectUrl).not.toContain('secret');
    await expect(
      provider.verifyPayment({
        providerPaymentId: created.providerPaymentId,
        orderId: 'order',
        amountMinor: 100,
        currency: 'USD',
      }),
    ).resolves.toEqual({ successful: true });
  });
  it('accepts signed success and rejects an invalid signature', () => {
    const payload = {
      eventId: 'event-1',
      orderId: 'order',
      providerPaymentId: 'mock_pay_1',
      status: 'succeeded',
    };
    expect(provider.parseWebhook(payload, provider.sign(payload))).toEqual(
      expect.objectContaining({
        providerEventId: 'event-1',
        successful: true,
      }),
    );
    expect(() => provider.parseWebhook(payload, 'bad')).toThrow(
      UnauthorizedException,
    );
  });
});
