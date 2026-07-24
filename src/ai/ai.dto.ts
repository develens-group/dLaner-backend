import { AiOperation, AiRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
export class CreateAiRequestDto {
  @IsString() @Length(1, 100) provider = 'mock';
  @IsString() @Length(1, 100) model!: string;
  @IsEnum(AiOperation) operation!: AiOperation;
  @IsObject() input!: Record<string, unknown>;
}
export class AiRequestQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsEnum(AiRequestStatus) status?: AiRequestStatus;
  @IsOptional() @IsEnum(AiOperation) operation?: AiOperation;
  @IsOptional() @IsString() @Length(1, 100) provider?: string;
  @IsOptional() @IsString() @Length(1, 100) model?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
