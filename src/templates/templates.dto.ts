import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { TemplateMetricType, TemplateVisibility } from '@prisma/client';

export class LibraryItemDto {
  @IsString() @MaxLength(150) id!: string;
  @IsIn(['published', 'unpublished']) status!: 'published' | 'unpublished';
  @IsArray() elements!: unknown[];
  @IsInt() @Min(0) created!: number;
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(100) form?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
export class LibraryDto {
  @IsString() @MaxLength(100) type!: string;
  @IsInt() @Min(1) version!: number;
  @IsString() @MaxLength(500) source!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LibraryItemDto)
  libraryItems!: LibraryItemDto[];
}
export class CreateTemplateDto {
  @IsString() @MaxLength(150) title!: string;
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsEnum(TemplateVisibility) visibility?: TemplateVisibility;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}
export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
export class CreateVersionDto {
  @IsObject() @ValidateNested() @Type(() => LibraryDto) library!: LibraryDto;
  @IsOptional() @IsString() @MaxLength(1000) changelog?: string;
}
export class ReviewDto {
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
export class ShareDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : undefined,
  )
  @IsDate()
  expiresAt?: Date;
  @IsOptional() @IsInt() @Min(1) @Max(100000) maxUses?: number;
}
export class EventDto {
  @IsEnum(TemplateMetricType) type!: TemplateMetricType;
}
export class ListTemplatesDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(50) tag?: string;
  @IsOptional() @IsString() @MaxLength(100) form?: string;
  @IsOptional() @IsString() @IsUUID() owner?: string;
  @IsOptional()
  @IsIn(['newest', 'updated', 'popular', 'mostDownloaded', 'title'])
  sort: 'newest' | 'updated' | 'popular' | 'mostDownloaded' | 'title' =
    'newest';
}
