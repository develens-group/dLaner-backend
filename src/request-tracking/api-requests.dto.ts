import { Type } from 'class-transformer';
import { ApiRequestSource } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ApiRequestQueryDto {
  @ApiPropertyOptional({ example: 'api-request-cursor-0001', maxLength: 128 })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  cursor?: string;
  @ApiPropertyOptional({
    example: 25,
    default: 25,
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
  @ApiPropertyOptional({ example: '/api/v1/credits/orders', maxLength: 512 })
  @IsOptional()
  @IsString()
  @Length(1, 512)
  route?: string;
  @ApiPropertyOptional({
    enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    example: 'GET',
  })
  @IsOptional()
  @IsIn(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'])
  method?: string;
  @ApiPropertyOptional({
    example: 200,
    minimum: 100,
    maximum: 599,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;
  @ApiPropertyOptional({
    example: 400,
    minimum: 100,
    maximum: 599,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  minStatusCode?: number;
  @ApiPropertyOptional({ example: 'VALIDATION_ERROR', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  errorCode?: string;
  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.999Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
  @ApiPropertyOptional({
    enum: ApiRequestSource,
    example: ApiRequestSource.WEB,
  })
  @IsOptional()
  @IsEnum(ApiRequestSource)
  source?: ApiRequestSource;
  @ApiPropertyOptional({
    example: 'request-01JABCDEF123456789',
    minLength: 8,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @Length(8, 128)
  requestId?: string;
  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    example: 'desc',
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
