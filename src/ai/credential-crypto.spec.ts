import {
  decryptSecret,
  encryptSecret,
  keyHint,
} from './credential-crypto';

describe('credential-crypto', () => {
  const key = Buffer.alloc(32, 7).toString('hex');

  it('round-trips a secret', () => {
    const encrypted = encryptSecret('sk-test-secret', key);
    expect(encrypted).not.toContain('sk-test-secret');
    expect(decryptSecret(encrypted, key)).toBe('sk-test-secret');
  });

  it('builds a safe key hint', () => {
    expect(keyHint('sk-abcdefghijklmnopqrstuvwxyz')).toBe('sk-...wxyz');
    expect(keyHint('abcd')).toBe('****');
  });
});
