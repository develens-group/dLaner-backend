import { Transform } from 'class-transformer';
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
export class RegisterDto extends EmailDto {
  @IsString()
  @Length(10, 128)
  @Matches(PASSWORD_PATTERN, {
    message:
      'password must contain uppercase, lowercase, and numeric characters',
  })
  password!: string;
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;
}
export class LoginDto extends EmailDto {
  @IsString() @Length(1, 128) password!: string;
}
export class TokenDto {
  @IsString() @Length(20, 4096) token!: string;
}
export class RefreshDto {
  @IsOptional() @IsString() @Length(20, 4096) refreshToken?: string;
}
export class ResetPasswordDto extends TokenDto {
  @IsString() @Length(10, 128) @Matches(PASSWORD_PATTERN) newPassword!: string;
}
export class ChangePasswordDto {
  @IsString() @Length(1, 128) currentPassword!: string;
  @IsString() @Length(10, 128) @Matches(PASSWORD_PATTERN) newPassword!: string;
}
