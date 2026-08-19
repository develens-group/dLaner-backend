import { createOpaqueToken, hashOpaqueToken } from '../common/security';
import { normalizeWordPressDomain } from './wordpress-site';

describe('wordpress connect helpers', () => {
  it('normalizes localhost and shop domains', () => {
    expect(normalizeWordPressDomain('http://localhost:8080')).toBe('localhost');
    expect(normalizeWordPressDomain('https://Shop.Example.com/path')).toBe(
      'shop.example.com',
    );
  });

  it('hashes installation keys stably', () => {
    const key = createOpaqueToken();
    expect(hashOpaqueToken(key)).toHaveLength(64);
    expect(hashOpaqueToken(key)).toBe(hashOpaqueToken(key));
  });
});
