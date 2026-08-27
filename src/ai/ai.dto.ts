import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiOperation, AiRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateAiRequestDto {
  @ApiProperty({
    example: 'openai',
    default: 'mock',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @Length(1, 100)
  provider = 'mock';

  @ApiProperty({ example: 'gpt-4o-mini', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  model!: string;

  @ApiProperty({ enum: AiOperation, example: AiOperation.TEXT_GENERATION })
  @IsEnum(AiOperation)
  operation!: AiOperation;

  @ApiProperty({
    type: 'object',
    example: {
      messages: [{ role: 'user', content: 'Write a short product description.' }],
    },
    additionalProperties: true,
  })
  @IsObject()
  input!: Record<string, unknown>;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description:
      'Optional user-owned API credential. When set, platform credits are not charged.',
  })
  @IsOptional()
  @IsString()
  @IsUUID()
  credentialId?: string;
}

export class AiRequestQueryDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsString()
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
    enum: AiRequestStatus,
    example: AiRequestStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(AiRequestStatus)
  status?: AiRequestStatus;

  @ApiPropertyOptional({
    enum: AiOperation,
    example: AiOperation.TEXT_GENERATION,
  })
  @IsOptional()
  @IsEnum(AiOperation)
  operation?: AiOperation;

  @ApiPropertyOptional({ example: 'mock' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  provider?: string;

  @ApiPropertyOptional({ example: 'mock-text-v1' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  model?: string;

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
}
