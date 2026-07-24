import { Injectable, NotFoundException } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProvider } from './payment-provider';
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();
  constructor(mock: MockPaymentProvider) {
    this.providers.set(mock.name, mock);
  }
  get(name: string) {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider)
      throw new NotFoundException('Payment provider is not configured');
    return provider;
  }
}
