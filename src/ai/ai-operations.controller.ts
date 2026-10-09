import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { memoryStorage } from 'multer';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { AiOperationsCatalogService } from './ai-operations.catalog';
import { AiOperationsExecuteService } from './ai-operations.execute.service';

class ExecuteOperationDto {
  @IsString() @MaxLength(100) type!: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsOptional() @IsString() @MaxLength(2000) prompt?: string;
  @IsOptional() @IsUUID() credentialId?: string;
}

class ExecuteCustomByokDto {
  @IsUUID() credentialId!: string;
  @IsString() @MaxLength(100) provider!: string;
  @IsString() @MaxLength(200) model!: string;
  @IsOptional() @IsIn(['generations', 'edits']) mode?: 'generations' | 'edits';
  @IsOptional() @IsString() @MaxLength(200) version?: string;
  @IsOptional() @IsString() @MaxLength(2000) prompt?: string;
}

@ApiTags('ai-operations')
@ApiBearerAuth()
@Controller('api/v1/ai')
export class AiOperationsController {
  constructor(
    private readonly catalog: AiOperationsCatalogService,
    private readonly executeService: AiOperationsExecuteService,
  ) {}

  @Get('operations') async list() {
    return response(await this.catalog.listTypes(false));
  }

  @Post('execute')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string' },
        variantId: { type: 'string', format: 'uuid' },
        prompt: { type: 'string' },
        credentialId: {
          type: 'string',
          format: 'uuid',
          description:
            'Optional BYOK credential; skips platform credits when provider supports user keys',
        },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async execute(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: ExecuteOperationDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return response(
      await this.executeService.execute(
        user.userId,
        dto.type,
        dto.variantId,
        { image, prompt: dto.prompt },
        dto.credentialId,
      ),
    );
  }

  /** Free-form image run with the user's own key (no admin catalog type). */
  @Post('execute-custom')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async executeCustom(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: ExecuteCustomByokDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return response(
      await this.executeService.executeCustom(user.userId, {
        credentialId: dto.credentialId,
        provider: dto.provider,
        model: dto.model,
        mode: dto.mode,
        version: dto.version,
        prompt: dto.prompt,
        image,
      }),
    );
  }
}
