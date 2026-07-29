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
  @IsIn(['smtp', 'resend']) MAIL_TRANSPORT = 'smtp';
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
  @IsString() DEFAULT_CURRENCY = 'USD';
  @IsInt() @Min(1) CREDIT_MAX_TRANSACTION_AMOUNT = 1000000000;
  @IsInt() @Min(1) CREDIT_RESERVATION_TTL_SECONDS = 900;
  @IsString() PAYMENT_PROVIDER = 'mock';
  @IsString() PAYMENT_WEBHOOK_SECRET!: string;
  @IsUrl({ require_tld: false }) PAYMENT_RETURN_URL!: string;
  @IsUrl({ require_tld: false }) PAYMENT_CANCEL_URL!: string;
  @IsIn(['true', 'false']) MOCK_PAYMENT_ENABLED = 'true';
  @IsIn(['true', 'false']) AI_CREDIT_CHARGING_ENABLED = 'true';
  @IsInt() @Min(0) AI_CREDIT_FIXED_COST = 1;
  @IsInt() @Min(1) AI_CREDIT_INPUT_UNIT_BYTES = 4096;
  @IsInt() @Min(0) AI_CREDIT_INPUT_UNIT_COST = 1;
  @IsInt() @Min(1) AI_CREDIT_OUTPUT_UNIT_BYTES = 4096;
  @IsInt() @Min(0) AI_CREDIT_OUTPUT_UNIT_COST = 0;
}

export function validateEnvironment(values: Record<string, unknown>) {
  const numericKeys = [
    'PORT',
    'API_REQUEST_RETENTION_DAYS',
    'API_REQUEST_MAX_BODY_BYTES',
    'API_REQUEST_MAX_QUERY_BYTES',
    'API_REQUEST_QUEUE_MAX_SIZE',
    'TRUST_PROXY',
    'AI_HISTORY_MAX_INPUT_BYTES',
    'AI_HISTORY_MAX_OUTPUT_BYTES',
    'AI_HISTORY_RETENTION_DAYS',
    'AI_PROVIDER_TIMEOUT_MS',
    'CREDIT_MAX_TRANSACTION_AMOUNT',
    'CREDIT_RESERVATION_TTL_SECONDS',
    'AI_CREDIT_FIXED_COST',
    'AI_CREDIT_INPUT_UNIT_BYTES',
    'AI_CREDIT_INPUT_UNIT_COST',
    'AI_CREDIT_OUTPUT_UNIT_BYTES',
    'AI_CREDIT_OUTPUT_UNIT_COST',
  ] as const;
  const normalized: Record<string, unknown> = { ...values };
  for (const key of numericKeys) {
    if (typeof normalized[key] === 'string' && normalized[key] !== '')
      normalized[key] = Number(normalized[key]);
  }
  const config = plainToInstance(Environment, normalized, {
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
  if (config.PAYMENT_WEBHOOK_SECRET.length < 32)
    throw new Error(
      'PAYMENT_WEBHOOK_SECRET must contain at least 32 characters',
    );
  if (
    config.MAIL_TRANSPORT === 'resend' &&
    (typeof values.RESEND_API_KEY !== 'string' || !values.RESEND_API_KEY.trim())
  )
    throw new Error(
      'RESEND_API_KEY is required when MAIL_TRANSPORT is set to resend',
    );
  if (
    config.MAIL_TRANSPORT === 'resend' &&
    (typeof values.MAIL_FROM !== 'string' || !values.MAIL_FROM.trim())
  )
    throw new Error(
      'MAIL_FROM is required when MAIL_TRANSPORT is set to resend',
    );
  return config;
}
