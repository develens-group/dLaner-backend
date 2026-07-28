import { IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Dlander User',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;
}
