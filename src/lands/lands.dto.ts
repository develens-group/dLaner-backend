import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'Landing page کمپین تابستان' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {
      version: 1,
      viewport: { width: 1440, height: 900, zoom: 1 },
      elements: [
        {
          id: 'hero-title',
          type: 'text',
          x: 120,
          y: 96,
          width: 640,
          height: 80,
          props: { text: 'محصول جدید ما', fontSize: 48, color: '#111827' },
        },
      ],
      settings: { direction: 'rtl', backgroundColor: '#ffffff' },
    },
  })
  @IsOptional()
  @IsObject()
  canvas?: Record<string, unknown>;
}

export class UpdateLandDto {
  @IsString() @IsNotEmpty() @MaxLength(150) title!: string;
}

export class SaveLandDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {
      version: 1,
      viewport: { width: 1440, height: 900, zoom: 1 },
      elements: [
        {
          id: 'hero-title',
          type: 'text',
          x: 120,
          y: 96,
          props: { text: 'محصول جدید ما' },
        },
      ],
      settings: { direction: 'rtl', backgroundColor: '#ffffff' },
    },
  })
  @IsObject()
  canvas!: Record<string, unknown>;
}

export class ListLandsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
