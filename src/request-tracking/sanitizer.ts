import { createHash } from 'node:crypto';

const SENSITIVE = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'passwordhash',
  'accesstoken',
  'refreshtoken',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'secret',
  'clientsecret',
  'paymenttoken',
  'cardnumber',
  'cvv',
]);
const AUTH_EMAIL_ROUTES = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/resend-verification',
  '/api/v1/auth/forgot-password',
]);

export interface SanitizedPayload {
  value: unknown;
  captured: boolean;
  truncated: boolean;
  redacted: boolean;
}

export function stablePayloadHash(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function sanitizePayload(
  value: unknown,
  maxBytes: number,
): SanitizedPayload {
  let truncated = false;
  let redacted = false;
  const visit = (input: unknown, depth = 0): unknown => {
    if (depth > 10) {
      truncated = true;
      return '[MAX_DEPTH]';
    }
    if (typeof input === 'string') {
      if (input.length > 2000) {
        truncated = true;
        return `${input.slice(0, 2000)}[TRUNCATED]`;
      }
      return input;
    }
    if (
      typeof input === 'number' ||
      typeof input === 'boolean' ||
      input === null
    )
      return input;
    if (Array.isArray(input)) {
      if (input.length > 100) truncated = true;
      return input.slice(0, 100).map((item) => visit(item, depth + 1));
    }
    if (typeof input === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(
        input as Record<string, unknown>,
      )) {
        if (SENSITIVE.has(key.toLowerCase())) {
          result[key] = '[REDACTED]';
          redacted = true;
        } else result[key] = visit(item, depth + 1);
      }
      return result;
    }
    return '[UNSUPPORTED]';
  };
  let sanitized = visit(value);
  const serialized = stableStringify(sanitized);
  if (Buffer.byteLength(serialized) > maxBytes) {
    truncated = true;
    sanitized = {
      omitted: true,
      reason: 'maximum size exceeded',
      originalBytes: Buffer.byteLength(serialized),
    };
  }
  return { value: sanitized, captured: true, truncated, redacted };
}

export function sanitizeHttpBody(
  route: string,
  body: unknown,
  enabled: boolean,
  maxBytes: number,
): SanitizedPayload {
  if (!enabled || body === undefined)
    return { value: null, captured: false, truncated: false, redacted: false };
  if (AUTH_EMAIL_ROUTES.has(route)) {
    const email =
      typeof body === 'object' &&
      body &&
      'email' in body &&
      typeof (body as { email?: unknown }).email === 'string'
        ? (body as { email: string }).email.trim().toLowerCase()
        : undefined;
    const captured: SanitizedPayload = {
      value: email ? { email } : null,
      captured: !!email,
      truncated: !!email && Buffer.byteLength(email) > maxBytes,
      redacted: true,
    };
    if (captured.truncated)
      captured.value = { omitted: true, reason: 'maximum size exceeded' };
    return captured;
  }
  if (route.startsWith('/api/v1/auth/') || route === '/api/v1/ai/requests')
    return { value: null, captured: false, truncated: false, redacted: true };
  return { value: null, captured: false, truncated: false, redacted: false };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
