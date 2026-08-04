import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { LoginDto } from '../auth/auth.dto';

export class WordPressLoginDto extends LoginDto {
  @ApiProperty({ example: 'https://shop.example.com', maxLength: 2048 })
  @IsString()
  @Length(1, 2048)
  siteUrl!: string;

  @ApiPropertyOptional({ example: 'My shop', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  siteName?: string;

  @ApiPropertyOptional({ example: { wpVersion: '6.8', phpVersion: '8.3' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateWordPressSiteDto {
  @ApiProperty({ example: 'shop.example.com', maxLength: 2048 })
  @IsString()
  @Length(1, 2048)
  domain!: string;

  @ApiPropertyOptional({ example: 'My shop', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
}

export class UpdateWordPressSiteDto {
  @ApiPropertyOptional({ example: 'new.example.com', maxLength: 2048 })
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  domain?: string;

  @ApiPropertyOptional({ example: 'New name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
