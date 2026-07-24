import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  Min,
  validateSync,
} from 'class-validator';

class Environment {
  @IsString() DATABASE_URL!: string;
  @IsString() JWT_ACCESS_SECRET!: string;
  @IsString() JWT_REFRESH_SECRET!: string;
  @IsString() JWT_ACCESS_EXPIRES_IN!: string;
  @IsString() JWT_REFRESH_EXPIRES_IN!: string;
  @IsString() EMAIL_VERIFICATION_EXPIRES_IN!: string;
  @IsString() PASSWORD_RESET_EXPIRES_IN!: string;
  @IsUrl({ require_tld: false }) FRONTEND_URL!: string;
  @IsIn(['body', 'cookie']) AUTH_REFRESH_TOKEN_TRANSPORT = 'body';
  @IsInt() @Min(1) PORT = 3000;
}

export function validateEnvironment(values: Record<string, unknown>) {
  const config = plainToInstance(Environment, values, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length) throw new Error(errors.toString());
  if (
    config.JWT_ACCESS_SECRET.length < 32 ||
    config.JWT_REFRESH_SECRET.length < 32
  )
    throw new Error('JWT secrets must contain at least 32 characters');
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET)
    throw new Error('JWT access and refresh secrets must differ');
  return config;
}
