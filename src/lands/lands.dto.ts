import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLandDto {
  @IsString() @IsNotEmpty() @MaxLength(150) title!: string;
  @IsOptional() @IsObject() canvas?: Record<string, unknown>;
}

export class UpdateLandDto {
  @IsString() @IsNotEmpty() @MaxLength(150) title!: string;
}

export class SaveLandDto {
  @IsObject() canvas!: Record<string, unknown>;
}

export class ListLandsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
