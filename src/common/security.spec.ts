import {
  createOpaqueToken,
  hashOpaqueToken,
  normalizeEmail,
  safeHashEqual,
} from './security';

describe('security helpers', () => {
  it('normalizes email before lookup and storage', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });
  it('creates random opaque tokens and deterministic non-raw hashes', () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).not.toBe(second);
    expect(hashOpaqueToken(first)).not.toContain(first);
    expect(safeHashEqual(hashOpaqueToken(first), hashOpaqueToken(first))).toBe(
      true,
    );
    expect(safeHashEqual(hashOpaqueToken(first), hashOpaqueToken(second))).toBe(
      false,
    );
  });
});
