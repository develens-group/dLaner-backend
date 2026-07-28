import {
  CreditLedgerType,
  CreditOrderStatus,
  CreditReservationStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CursorDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
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
export class LedgerQueryDto extends CursorDto {
  @ApiPropertyOptional({
    enum: CreditLedgerType,
    example: CreditLedgerType.PURCHASE,
  })
  @IsOptional()
  @IsEnum(CreditLedgerType)
  type?: CreditLedgerType;
}
export class ReservationQueryDto extends CursorDto {
  @ApiPropertyOptional({
    enum: CreditReservationStatus,
    example: CreditReservationStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CreditReservationStatus)
  status?: CreditReservationStatus;
}
export class OrderQueryDto extends CursorDto {
  @ApiPropertyOptional({
    enum: CreditOrderStatus,
    example: CreditOrderStatus.CREATED,
  })
  @IsOptional()
  @IsEnum(CreditOrderStatus)
  status?: CreditOrderStatus;
}
export class CreateOrderDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  packageId!: string;
}
export class IdempotencyDto {
  @ApiProperty({
    example: 'credit-operation-0001',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
export class AdjustmentDto extends IdempotencyDto {
  @ApiProperty({ example: 100, minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;
  @ApiProperty({
    example: 'Promotional credit grant',
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @Length(3, 500)
  reason!: string;
  @ApiPropertyOptional({ example: 'campaign-summer-2026', maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  externalReference?: string;
}
export class RefundDto extends IdempotencyDto {
  @ApiProperty({ example: 100, minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;
  @ApiProperty({
    example: 'Customer refund request',
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @Length(3, 500)
  reason!: string;
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  orderId!: string;
}
export class CreditPackageDto {
  @ApiProperty({ example: 'Starter Pack', minLength: 1, maxLength: 150 })
  @IsString()
  @Length(1, 150)
  name!: string;
  @ApiPropertyOptional({
    example: 'A starter credit package',
    minLength: 1,
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;
  @ApiProperty({ example: 1000, minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creditAmount!: number;
  @ApiProperty({ example: 100, default: 0, minimum: 0, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bonusCreditAmount = 0;
  @ApiProperty({ example: 9900, minimum: 0, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinor!: number;
  @ApiProperty({ example: 'USD', pattern: '^[A-Z]{3}$' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @ApiPropertyOptional({ example: true, type: Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @ApiPropertyOptional({ example: 10, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
  @ApiPropertyOptional({ example: 5, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  purchaseLimitPerUser?: number;
  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;
  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.999Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
export class UpdateCreditPackageDto {
  @ApiPropertyOptional({
    example: 'Starter Pack Plus',
    minLength: 1,
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;
  @ApiPropertyOptional({
    example: 'Updated package description',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;
  @ApiPropertyOptional({ example: 1200, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creditAmount?: number;
  @ApiPropertyOptional({ example: 150, minimum: 0, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bonusCreditAmount?: number;
  @ApiPropertyOptional({ example: 10900, minimum: 0, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinor?: number;
  @ApiPropertyOptional({ example: 'USD', pattern: '^[A-Z]{3}$' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @ApiPropertyOptional({ example: true, type: Boolean })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @ApiPropertyOptional({ example: 10, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
