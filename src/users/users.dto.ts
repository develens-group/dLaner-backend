import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 100) displayName?: string;
}
