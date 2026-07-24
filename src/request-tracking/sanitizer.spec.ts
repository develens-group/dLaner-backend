import {
  sanitizeHttpBody,
  sanitizePayload,
  stablePayloadHash,
} from './sanitizer';

describe('request payload sanitizer', () => {
  it('redacts sensitive keys recursively', () => {
    const result = sanitizePayload(
      {
        profile: { password: 'secret', accessToken: 'jwt', safe: 'value' },
      },
      4096,
    );
    expect(result.redacted).toBe(true);
    expect(result.value).toEqual({
      profile: {
        password: '[REDACTED]',
        accessToken: '[REDACTED]',
        safe: 'value',
      },
    });
  });
  it('omits oversized payloads and marks truncation', () => {
    const result = sanitizePayload({ prompt: 'a'.repeat(10_000) }, 100);
    expect(result.truncated).toBe(true);
    expect(result.value).toEqual(expect.objectContaining({ omitted: true }));
  });
  it('captures only normalized email on approved auth routes', () => {
    const result = sanitizeHttpBody(
      '/api/v1/auth/login',
      {
        email: ' USER@Example.com ',
        password: 'NeverStore',
      },
      true,
      4096,
    );
    expect(result.value).toEqual({ email: 'user@example.com' });
    expect(JSON.stringify(result.value)).not.toContain('NeverStore');
  });
  it('omits token-bearing auth and complete AI bodies', () => {
    expect(
      sanitizeHttpBody(
        '/api/v1/auth/reset-password',
        { token: 'raw' },
        true,
        4096,
      ).captured,
    ).toBe(false);
    expect(
      sanitizeHttpBody('/api/v1/ai/requests', { prompt: 'private' }, true, 4096)
        .captured,
    ).toBe(false);
  });
  it('creates a stable hash independent of key order', () => {
    expect(stablePayloadHash({ a: 1, b: 2 })).toBe(
      stablePayloadHash({ b: 2, a: 1 }),
    );
  });
});
