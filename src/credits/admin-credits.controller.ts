import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser, Roles } from '../common/decorators';
import { CreditCommerceService } from './credit-commerce.service';
import {
  AdjustmentDto,
  CreditPackageDto,
  CursorDto,
  LedgerQueryDto,
  OrderQueryDto,
  RefundDto,
  UpdateCreditPackageDto,
} from './credits.dto';
import { CreditService } from './credit.service';

@ApiTags('admin-credits')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin')
export class AdminCreditsController {
  constructor(
    private readonly credits: CreditService,
    private readonly commerce: CreditCommerceService,
    private readonly audit: AuditService,
  ) {}
  @Get('credit-packages') async packages() {
    return response(await this.commerce.packages(true));
  }
  @Post('credit-packages') async createPackage(
    @CurrentUser() actor: AccessPrincipal,
    @Body() dto: CreditPackageDto,
  ) {
    const pkg = await this.commerce.createPackage(dto);
    this.audit.record(
      'credit_package.created',
      actor.userId,
      pkg.id,
      'CreditPackage',
    );
    return response(pkg);
  }
  @Patch('credit-packages/:id') async updatePackage(
    @CurrentUser() actor: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCreditPackageDto,
  ) {
    const pkg = await this.commerce.updatePackage(id, dto);
    this.audit.record(
      'credit_package.updated',
      actor.userId,
      id,
      'CreditPackage',
    );
    return response(pkg);
  }
  @Delete('credit-packages/:id') async deletePackage(
    @CurrentUser() actor: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const pkg = await this.commerce.deletePackage(id);
    this.audit.record(
      'credit_package.deleted',
      actor.userId,
      id,
      'CreditPackage',
    );
    return response(pkg);
  }
  @Get('credit-accounts') async accounts(@Query() query: CursorDto) {
    const result = await this.commerce.adminAccounts(query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Get('credit-accounts/:userId') async account(
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return response(await this.commerce.adminAccount(userId));
  }
  @Get('credit-accounts/:userId/transactions') async transactions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: LedgerQueryDto,
  ) {
    const result = await this.commerce.ledger(userId, query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Post('credit-accounts/:userId/grant') async grant(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdjustmentDto,
  ) {
    const entry = await this.credits.grantCredits(
      userId,
      dto.amount,
      dto.idempotencyKey,
      'ADMIN_ADJUSTMENT',
      dto.externalReference,
      actor.userId,
      dto.reason,
    );
    this.adjustmentAudit('credit.admin_grant', actor, userId, entry.id, dto);
    return response(entry);
  }
  @Post('credit-accounts/:userId/deduct') async deduct(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdjustmentDto,
  ) {
    const entry = await this.credits.deductCredits(
      userId,
      dto.amount,
      dto.idempotencyKey,
      actor.userId,
      dto.reason,
      dto.externalReference,
    );
    this.adjustmentAudit(
      'credit.admin_deduction',
      actor,
      userId,
      entry.id,
      dto,
    );
    return response(entry);
  }
  @Post('credit-accounts/:userId/refund') async refund(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RefundDto,
  ) {
    const entry = await this.credits.refundPurchase(
      userId,
      dto.orderId,
      dto.amount,
      dto.idempotencyKey,
      actor.userId,
      dto.reason,
    );
    this.audit.record('credit.refund', actor.userId, userId, 'CreditAccount', {
      ledgerEntryId: entry.id,
      amount: dto.amount,
      reason: dto.reason,
      orderId: dto.orderId,
    });
    return response(entry);
  }
  @Post('credit-accounts/:userId/reconcile')
  @HttpCode(HttpStatus.OK)
  async reconcile(
    @CurrentUser() actor: AccessPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const result = await this.credits.rebuildBalanceFromLedger(
      userId,
      false,
      actor.userId,
    );
    this.audit.record(
      'credit.reconciliation_checked',
      actor.userId,
      userId,
      'CreditAccount',
      result,
    );
    return response(result);
  }
  @Get('credit-orders') async orders(@Query() query: OrderQueryDto) {
    const result = await this.commerce.orders(undefined, query);
    return response(result.items, { nextCursor: result.nextCursor });
  }
  @Get('credit-orders/:orderId') async order(
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return response(await this.commerce.adminOrder(id));
  }
  private adjustmentAudit(
    action: string,
    actor: AccessPrincipal,
    userId: string,
    entryId: string,
    dto: AdjustmentDto,
  ) {
    this.audit.record(action, actor.userId, userId, 'CreditAccount', {
      ledgerEntryId: entryId,
      amount: dto.amount,
      reason: dto.reason,
    });
  }
}
