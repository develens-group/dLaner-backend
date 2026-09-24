import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
} from 'class-validator';

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
