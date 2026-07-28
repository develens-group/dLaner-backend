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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { CreditCommerceService } from './credit-commerce.service';
import {
  CreateOrderDto,
  LedgerQueryDto,
  OrderQueryDto,
  ReservationQueryDto,
} from './credits.dto';
import { CreditService } from './credit.service';

@ApiTags('credits')
@ApiBearerAuth()
@Controller('api/v1/credits')
export class CreditsController {
  constructor(
    private readonly credits: CreditService,
    private readonly commerce: CreditCommerceService,
  ) {}
  @Get('balance') async balance(@CurrentUser() user: AccessPrincipal) {
    return response(await this.credits.getBalance(user.userId));
  }
  @Get('transactions') async transactions(
    @CurrentUser() user: AccessPrincipal,
    @Query() query: LedgerQueryDto,
  ) {
    const result = await this.commerce.ledger(user.userId, query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Get('reservations') async reservations(
    @CurrentUser() user: AccessPrincipal,
    @Query() query: ReservationQueryDto,
  ) {
    const result = await this.commerce.reservations(user.userId, query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Get('packages') async packages() {
    return response(await this.commerce.packages());
  }
  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createOrder(
    @CurrentUser() user: AccessPrincipal,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    return response(
      await this.commerce.createOrder(user.userId, dto.packageId, key ?? ''),
    );
  }
  @Get('orders') async orders(
    @CurrentUser() user: AccessPrincipal,
    @Query() query: OrderQueryDto,
  ) {
    const result = await this.commerce.orders(user.userId, query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Get('orders/:orderId') async order(
    @CurrentUser() user: AccessPrincipal,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return response(await this.commerce.ownedOrder(user.userId, id));
  }
  @Post('orders/:orderId/start-payment')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async startPayment(
    @CurrentUser() user: AccessPrincipal,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return response(await this.commerce.startPayment(user.userId, id));
  }
  @Post('orders/:orderId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: AccessPrincipal,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return response(await this.commerce.cancelOrder(user.userId, id));
  }
}
