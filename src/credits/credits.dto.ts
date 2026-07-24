import {
  CreditLedgerType,
  CreditOrderStatus,
  CreditReservationStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
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
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
export class LedgerQueryDto extends CursorDto {
  @IsOptional() @IsEnum(CreditLedgerType) type?: CreditLedgerType;
}
export class ReservationQueryDto extends CursorDto {
  @IsOptional()
  @IsEnum(CreditReservationStatus)
  status?: CreditReservationStatus;
}
export class OrderQueryDto extends CursorDto {
  @IsOptional() @IsEnum(CreditOrderStatus) status?: CreditOrderStatus;
}
export class CreateOrderDto {
  @IsUUID() packageId!: string;
}
export class IdempotencyDto {
  @IsString() @Length(8, 128) idempotencyKey!: string;
}
export class AdjustmentDto extends IdempotencyDto {
  @Type(() => Number) @IsInt() @Min(1) amount!: number;
  @IsString() @Length(3, 500) reason!: string;
  @IsOptional() @IsString() @Length(1, 255) externalReference?: string;
}
export class RefundDto extends IdempotencyDto {
  @Type(() => Number) @IsInt() @Min(1) amount!: number;
  @IsString() @Length(3, 500) reason!: string;
  @IsUUID() orderId!: string;
}
export class CreditPackageDto {
  @IsString() @Length(1, 150) name!: string;
  @IsOptional() @IsString() @Length(1, 1000) description?: string;
  @Type(() => Number) @IsInt() @Min(1) creditAmount!: number;
  @Type(() => Number) @IsInt() @Min(0) bonusCreditAmount = 0;
  @Type(() => Number) @IsInt() @Min(0) priceMinor!: number;
  @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  purchaseLimitPerUser?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
export class UpdateCreditPackageDto {
  @IsOptional() @IsString() @Length(1, 150) name?: string;
  @IsOptional() @IsString() @Length(1, 1000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) creditAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bonusCreditAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceMinor?: number;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
