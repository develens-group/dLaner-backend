import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { AiOperationsCatalogService } from './ai-operations.catalog';
import {
  CreateOperationTypeDto,
  CreateProviderVariantDto,
  UpdateOperationTypeDto,
  UpdateProviderVariantDto,
} from './ai-operations.dto';

@ApiTags('admin-ai-catalog')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('api/v1/admin/ai')
export class AdminAiCatalogController {
  constructor(
    private readonly catalog: AiOperationsCatalogService,
    private readonly audit: AuditService,
  ) {}

  @Get('providers') providers() {
    return response(this.catalog.listProviders());
  }

  @Get('operation-types') async listTypes() {
    return response(await this.catalog.listTypes(true));
  }

  @Post('operation-types') async createType(
    @CurrentUser() actor: AccessPrincipal,
    @Body() dto: CreateOperationTypeDto,
  ) {
    const item = await this.catalog.createType(dto);
    this.audit.record(
      'ai_operation_type.created',
      actor.userId,
      item.id as string,
      'AiOperationType',
    );
    return response(item);
  }

  @Get('operation-types/:id') async getType(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return response(await this.catalog.getType(id, true));
  }

  @Patch('operation-types/:id') async updateType(
    @CurrentUser() actor: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperationTypeDto,
  ) {
    const item = await this.catalog.updateType(id, dto);
    this.audit.record(
      'ai_operation_type.updated',
      actor.userId,
      id,
      'AiOperationType',
    );
    return response(item);
  }

  @Delete('operation-types/:id') async deleteType(
    @CurrentUser() actor: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.catalog.deleteType(id);
    this.audit.record(
      'ai_operation_type.deactivated',
      actor.userId,
      id,
      'AiOperationType',
    );
    return response(item);
  }

  @Get('provider-variants') async listVariants(
    @Query('typeId') typeId?: string,
  ) {
    return response(await this.catalog.listVariants(typeId));
  }

  @Post('provider-variants') async createVariant(
    @CurrentUser() actor: AccessPrincipal,
    @Body() dto: CreateProviderVariantDto,
  ) {
    const item = await this.catalog.createVariant(dto);
    this.audit.record(
      'ai_provider_variant.created',
      actor.userId,
      item.id as string,
      'AiProviderVariant',
    );
    return response(item);
  }

  @Patch('provider-variants/:id') async updateVariant(
    @CurrentUser() actor: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderVariantDto,
  ) {
    const item = await this.catalog.updateVariant(id, dto);
    this.audit.record(
      'ai_provider_variant.updated',
      actor.userId,
      id,
      'AiProviderVariant',
    );
    return response(item);
  }

  @Post('provider-variants/:id/set-default')
  @HttpCode(200)
  async setDefault(
    @CurrentUser() actor: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.catalog.setDefault(id);
    this.audit.record(
      'ai_provider_variant.set_default',
      actor.userId,
      id,
      'AiProviderVariant',
    );
    return response(item);
  }

  @Delete('provider-variants/:id') async deleteVariant(
    @CurrentUser() actor: AccessPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const item = await this.catalog.deleteVariant(id);
    this.audit.record(
      'ai_provider_variant.deactivated',
      actor.userId,
      id,
      'AiProviderVariant',
    );
    return response(item);
  }
}
