import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import {
  TemplateMetricType,
  TemplateReviewStatus,
  TemplateVisibility,
} from '@prisma/client';

export class LibraryItemDto {
  @IsString() @MaxLength(150) id!: string;
  @IsIn(['published', 'unpublished']) status!: 'published' | 'unpublished';
  @IsArray() elements!: unknown[];
  @IsOptional() @IsInt() @Min(0) created?: number;
  @IsString() @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsIn(['craft', 'html', 'frame']) form?: 'craft' | 'html' | 'frame';
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
  @IsString() @IsNotEmpty() @MaxLength(150) title!: string;
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsEnum(TemplateVisibility) visibility?: TemplateVisibility;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === null || value === '' ? null : value,
  )
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  categoryId?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
}
export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}

export class BulkCreateTemplateItemDto {
  @IsString() @IsNotEmpty() @MaxLength(150) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsObject()
  @ValidateNested()
  @Type(() => LibraryDto)
  library!: LibraryDto;
  @IsOptional()
  @IsString()
  @MaxLength(8_000_000)
  previewImageBase64?: string;
  @IsOptional()
  @IsIn(['image/jpeg', 'image/jpg', 'image/png'])
  previewImageType?: 'image/jpeg' | 'image/jpg' | 'image/png';
}

export class BulkCreateTemplatesDto {
  @IsOptional() @IsEnum(TemplateVisibility) visibility?: TemplateVisibility;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === null || value === '' ? null : value,
  )
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  categoryId?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];
  @IsOptional() @IsString() @MaxLength(1000) changelog?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BulkCreateTemplateItemDto)
  items!: BulkCreateTemplateItemDto[];
}

export class CreateVersionDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @IsObject()
  @ValidateNested()
  @Type(() => LibraryDto)
  library!: LibraryDto;
  @IsOptional() @IsString() @MaxLength(1000) changelog?: string;
  /** Raw base64 (no data: prefix preferred). Optional JSON-body preview. */
  @IsOptional()
  @IsString()
  @MaxLength(8_000_000)
  previewImageBase64?: string;
  @IsOptional()
  @IsIn(['image/jpeg', 'image/jpg', 'image/png'])
  previewImageType?: 'image/jpeg' | 'image/jpg' | 'image/png';
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

export class AdminTemplateQueryDto extends ListTemplatesDto {
  @IsOptional()
  @IsEnum(TemplateReviewStatus)
  reviewStatus?: TemplateReviewStatus;
  @IsOptional() @IsEnum(TemplateVisibility) visibility?: TemplateVisibility;
}

export class CreateTemplateCategoryDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  slug!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}
export class UpdateTemplateCategoryDto extends PartialType(
  CreateTemplateCategoryDto,
) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
