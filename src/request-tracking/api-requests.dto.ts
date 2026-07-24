import { Type } from 'class-transformer';
import { ApiRequestSource } from '@prisma/client';
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
  @IsOptional() @IsString() @Length(1, 128) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() @Length(1, 512) route?: string;
  @IsOptional()
  @IsIn(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'])
  method?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  minStatusCode?: number;
  @IsOptional() @IsString() @Length(1, 100) errorCode?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(ApiRequestSource) source?: ApiRequestSource;
  @IsOptional() @IsString() @Length(8, 128) requestId?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
}
