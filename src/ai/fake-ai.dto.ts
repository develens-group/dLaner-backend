import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { FAKE_AI_TYPE_IDS } from './fake-ai.catalog';

export class FakeAiExecuteDto {
  @ApiProperty({
    enum: FAKE_AI_TYPE_IDS,
    example: 'remove-background',
    description: 'Fake AI operation type',
  })
  @IsString()
  @IsIn([...FAKE_AI_TYPE_IDS])
  type!: string;

  @ApiPropertyOptional({
    example: 'remove the person on the left',
    description:
      'Required for remove-object, generate-image, image-to-image, replace-background',
  })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  prompt?: string;

  @ApiPropertyOptional({ example: 'pencil' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  style?: string;

  @ApiPropertyOptional({
    example: '0.7',
    description: 'image-to-image strength 0..1 (sent as form string)',
  })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({
    example: '2',
    description: 'upscale-image scale: 2 or 4',
  })
  @IsOptional()
  @IsString()
  scale?: string;

  @ApiPropertyOptional({ example: '512' })
  @IsOptional()
  @IsString()
  width?: string;

  @ApiPropertyOptional({ example: '512' })
  @IsOptional()
  @IsString()
  height?: string;
}
