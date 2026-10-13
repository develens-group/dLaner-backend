import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { response } from '../common/api-response';
import { Public } from '../common/decorators';
import { SubscriptionCommerceService } from '../billing/subscription-commerce.service';
import { CreditCommerceService } from '../credits/credit-commerce.service';

@ApiTags('payment-webhooks')
@Controller('api/v1/payments/webhooks')
export class PaymentWebhookController {
  constructor(
    private readonly credits: CreditCommerceService,
    private readonly subscriptions: SubscriptionCommerceService,
  ) {}

  @Public()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param('provider') provider: string,
    @Headers('x-payment-signature') signature: string | undefined,
    @Body() payload: unknown,
  ) {
    const sub = await this.subscriptions.tryProcessWebhook(
      provider,
      payload,
      signature,
    );
    if (sub) return response(sub);
    return response(
      await this.credits.processWebhook(provider, payload, signature),
    );
  }
}
