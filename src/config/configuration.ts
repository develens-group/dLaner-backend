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
  @IsIn(['true', 'false']) API_REQUEST_STORAGE_ENABLED = 'true';
  @IsIn(['true', 'false']) API_REQUEST_BODY_CAPTURE_ENABLED = 'false';
  @IsInt() @Min(1) API_REQUEST_RETENTION_DAYS = 30;
  @IsInt() @Min(256) API_REQUEST_MAX_BODY_BYTES = 8192;
  @IsInt() @Min(256) API_REQUEST_MAX_QUERY_BYTES = 4096;
  @IsIn(['buffered', 'sync']) API_REQUEST_PERSISTENCE_MODE = 'buffered';
  @IsInt() @Min(1) API_REQUEST_QUEUE_MAX_SIZE = 1000;
  @IsInt() @Min(0) TRUST_PROXY = 1;
  @IsIn(['true', 'false']) AI_HISTORY_STORE_INPUT = 'true';
  @IsIn(['true', 'false']) AI_HISTORY_STORE_OUTPUT = 'true';
  @IsInt() @Min(256) AI_HISTORY_MAX_INPUT_BYTES = 32768;
  @IsInt() @Min(256) AI_HISTORY_MAX_OUTPUT_BYTES = 32768;
  @IsInt() @Min(1) AI_HISTORY_RETENTION_DAYS = 90;
  @IsInt() @Min(100) AI_PROVIDER_TIMEOUT_MS = 30000;
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
