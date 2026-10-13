import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { PaymentWebhookController } from '../payments/payment-webhook.controller';
import { BillingController } from './billing.controller';
import { BillingPlansService } from './billing-plans.service';
import { BillingService } from './billing.service';
import { BillingStorageService } from './billing-storage.service';
import { SubscriptionCommerceService } from './subscription-commerce.service';

@Module({
  imports: [CreditsModule],
  controllers: [BillingController, PaymentWebhookController],
  providers: [
    BillingPlansService,
    BillingStorageService,
    BillingService,
    SubscriptionCommerceService,
  ],
  exports: [
    BillingStorageService,
    BillingPlansService,
    BillingService,
    SubscriptionCommerceService,
  ],
})
export class BillingModule {}
