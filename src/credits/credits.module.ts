import { Module } from '@nestjs/common';
import { PaymentProviderRegistry } from '../payments/payment-provider.registry';
import { PaymentWebhookController } from '../payments/payment-webhook.controller';
import { MockPaymentProvider } from '../payments/mock-payment.provider';
import { AdminCreditsController } from './admin-credits.controller';
import { CreditCommerceService } from './credit-commerce.service';
import { CreditService } from './credit.service';
import { CreditsController } from './credits.controller';
import { CreditCostCalculator } from './credit-cost-calculator';

@Module({
  controllers: [
    CreditsController,
    AdminCreditsController,
    PaymentWebhookController,
  ],
  providers: [
    CreditService,
    CreditCommerceService,
    CreditCostCalculator,
    MockPaymentProvider,
    PaymentProviderRegistry,
  ],
  exports: [CreditService, CreditCostCalculator],
})
export class CreditsModule {}
