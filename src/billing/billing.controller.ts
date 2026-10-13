import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsUUID } from 'class-validator';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { BillingPlansService } from './billing-plans.service';
import { BillingService } from './billing.service';
import { SubscriptionCommerceService } from './subscription-commerce.service';

class CreateSubscriptionOrderDto {
  @IsUUID() planId!: string;
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller('api/v1/billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly plans: BillingPlansService,
    private readonly commerce: SubscriptionCommerceService,
  ) {}

  @Get('plans')
  async listPlans() {
    return response(await this.plans.listPlans(true));
  }

  @Get('me')
  async me(@CurrentUser() user: AccessPrincipal) {
    return response(await this.billing.me(user.userId));
  }

  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createOrder(
    @CurrentUser() user: AccessPrincipal,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateSubscriptionOrderDto,
  ) {
    return response(
      await this.commerce.createOrder(user.userId, dto.planId, key ?? ''),
    );
  }

  @Post('orders/:orderId/start-payment')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async startPayment(
    @CurrentUser() user: AccessPrincipal,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return response(await this.commerce.startPayment(user.userId, orderId));
  }

  @Get('orders/:orderId')
  async order(
    @CurrentUser() user: AccessPrincipal,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return response(await this.commerce.ownedOrder(user.userId, orderId));
  }
}
