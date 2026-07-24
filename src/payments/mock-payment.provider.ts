import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { stablePayloadHash } from '../request-tracking/sanitizer';
import {
  CreatePaymentRequest,
  CreatePaymentResult,
  PaymentProvider,
  PaymentWebhookResult,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from './payment-provider';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  constructor(private readonly config: ConfigService) {}
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResult> {
    if (this.config.get('MOCK_PAYMENT_ENABLED', 'true') !== 'true')
      return Promise.reject(
        new UnauthorizedException('Mock payments are disabled'),
      );
    const providerPaymentId = `mock_pay_${randomUUID()}`;
    return Promise.resolve({
      providerPaymentId,
      redirectUrl: `${request.returnUrl}?mockPaymentId=${encodeURIComponent(providerPaymentId)}&orderId=${encodeURIComponent(request.orderId)}`,
      safeResponse: { environment: 'development' },
    });
  }
  verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    return Promise.resolve({
      successful:
        request.providerPaymentId.startsWith('mock_pay_') &&
        request.amountMinor >= 0 &&
        request.currency.length === 3,
      failureCode: request.providerPaymentId.startsWith('mock_pay_')
        ? undefined
        : 'INVALID_PAYMENT',
    });
  }
  parseWebhook(payload: unknown, signature?: string): PaymentWebhookResult {
    if (this.config.get('MOCK_PAYMENT_ENABLED', 'true') !== 'true')
      throw new UnauthorizedException('Mock payments are disabled');
    if (!payload || typeof payload !== 'object')
      throw new UnauthorizedException('Invalid webhook');
    const data = payload as Record<string, unknown>;
    const expected = this.sign(payload);
    const a = Buffer.from(signature ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new UnauthorizedException('Invalid webhook signature');
    const providerEventId = stringField(data, 'eventId');
    const orderId = stringField(data, 'orderId');
    const providerPaymentId = stringField(data, 'providerPaymentId');
    const successful = data.status === 'succeeded';
    return {
      providerEventId,
      orderId,
      providerPaymentId,
      successful,
      eventType: successful ? 'payment.succeeded' : 'payment.failed',
      payload: data,
    };
  }
  sign(payload: unknown) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('PAYMENT_WEBHOOK_SECRET'),
    )
      .update(stablePayloadHash(payload))
      .digest('hex');
  }
}
function stringField(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (typeof value !== 'string' || !value)
    throw new UnauthorizedException('Invalid webhook');
  return value;
}
