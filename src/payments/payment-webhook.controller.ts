import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { response } from '../common/api-response';
import { Public } from '../common/decorators';
import { CreditCommerceService } from '../credits/credit-commerce.service';

@ApiTags('payment-webhooks')
@Controller('api/v1/payments/webhooks')
export class PaymentWebhookController {
  constructor(private readonly commerce: CreditCommerceService) {}
  @Public()
  @Post(':provider')
  async webhook(
    @Param('provider') provider: string,
    @Headers('x-payment-signature') signature: string | undefined,
    @Body() payload: unknown,
  ) {
    return response(
      await this.commerce.processWebhook(provider, payload, signature),
    );
  }
}
