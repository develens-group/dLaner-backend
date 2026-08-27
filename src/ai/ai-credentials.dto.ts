import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateAiCredentialDto {
  @ApiProperty({ example: 'openai', minLength: 1, maxLength: 100 })
  @IsString()
  @Length(1, 100)
  provider!: string;

  @ApiProperty({ example: 'sk-proj-...', minLength: 16, maxLength: 512 })
  @IsString()
  @Length(16, 512)
  apiKey!: string;

  @ApiPropertyOptional({ example: 'Personal OpenAI', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAiCredentialDto {
  @ApiPropertyOptional({ example: 'Work key', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
