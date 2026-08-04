import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export class EmailDto {
  @ApiProperty({ example: 'user@example.com', format: 'email', maxLength: 320 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
export class RegisterDto extends EmailDto {
  @ApiProperty({
    example: 'StrongPass123',
    minLength: 10,
    maxLength: 128,
    description: 'Must contain uppercase, lowercase, and numeric characters',
  })
  @IsString()
  @Length(10, 128)
  @Matches(PASSWORD_PATTERN, {
    message:
      'password must contain uppercase, lowercase, and numeric characters',
  })
  password!: string;
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
export class LoginDto extends EmailDto {
  @ApiProperty({ example: 'StrongPass123', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Length(36, 36)
  captchaId?: string;

  @ApiPropertyOptional({ example: '7K9P2' })
  @IsOptional()
  @IsString()
  @Length(5, 5)
  captchaCode?: string;
}

export class CaptchaRequestDto extends EmailDto {}
export class TokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiJ9.valid-verification-token',
    minLength: 20,
    maxLength: 4096,
  })
  @IsString()
  @Length(20, 4096)
  token!: string;
}
export class RefreshDto {
  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1NiJ9.valid-refresh-token',
    minLength: 20,
    maxLength: 4096,
  })
  @IsOptional()
  @IsString()
  @Length(20, 4096)
  refreshToken?: string;
}
export class ResetPasswordDto extends TokenDto {
  @ApiProperty({
    example: 'NewStrongPass123',
    minLength: 10,
    maxLength: 128,
  })
  @IsString()
  @Length(10, 128)
  @Matches(PASSWORD_PATTERN)
  newPassword!: string;
}
export class ChangePasswordDto {
  @ApiProperty({ example: 'StrongPass123', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  currentPassword!: string;
  @ApiProperty({
    example: 'NewStrongPass123',
    minLength: 10,
    maxLength: 128,
  })
  @IsString()
  @Length(10, 128)
  @Matches(PASSWORD_PATTERN)
  newPassword!: string;
}
