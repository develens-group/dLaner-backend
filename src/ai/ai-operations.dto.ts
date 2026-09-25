import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { parseCreditAmount } from '../credits/credit-units';

@ValidatorConstraint({ name: 'isCreditAmount', async: false })
class IsCreditAmountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    try {
      parseCreditAmount(value);
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a non-negative decimal (number or string, up to 18 places)`;
  }
}

export class CreateOperationTypeDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug!: string;
  @IsString() @MaxLength(150) label!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateOperationTypeDto extends PartialType(CreateOperationTypeDto) {}

export class CreateProviderVariantDto {
  @IsUUID() typeId!: string;
  @IsString() @MaxLength(100) provider!: string;
  @IsString() @MaxLength(255) externalModel!: string;
  @IsString() @MaxLength(150) label!: string;
  @ApiProperty({
    example: '0.000000123',
    description: 'Credit cost (number or decimal string, up to 18 places)',
  })
  @Transform(({ value }: { value: unknown }) => value)
  @Validate(IsCreditAmountConstraint)
  creditCost!: number | string;
  @IsOptional() @Type(() => Number) @IsInt() priority?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsObject() configJson?: Record<string, unknown>;
}

export class UpdateProviderVariantDto extends PartialType(
  CreateProviderVariantDto,
) {
  @IsOptional() @IsUUID() typeId?: string;
}
