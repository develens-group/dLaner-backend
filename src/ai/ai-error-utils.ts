import { HttpException } from '@nestjs/common';

/** Strip API keys / bearer tokens from error strings before persisting. */
export function redactSecrets(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{4,}/g, 'sk-[REDACTED]');
}

const AUTH_MESSAGE_PATTERN =
  /invalid[_\s-]*api[_\s-]*key|incorrect api key|invalid_api_key|api key.*(invalid|revoked|expired)|authentication (failed|error)|unauthori[sz]ed/i;

/** True only for provider auth failures (HTTP 401/403 or clear invalid-key text). */
export function isProviderAuthError(error: unknown): boolean {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (body && typeof body === 'object') {
      const status = (body as { providerStatus?: unknown }).providerStatus;
      if (status === 401 || status === 403) return true;
    }
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (
    !(error instanceof HttpException) &&
    (status === 401 || status === 403)
  )
    return true;
  const message = error instanceof Error ? error.message : '';
  return AUTH_MESSAGE_PATTERN.test(message);
}
