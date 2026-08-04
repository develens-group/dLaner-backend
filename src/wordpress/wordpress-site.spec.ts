import { BadRequestException } from '@nestjs/common';
import { normalizeWordPressDomain } from './wordpress-site';

describe('normalizeWordPressDomain', () => {
  it('normalizes URLs and bare domains to a stable hostname', () => {
    expect(normalizeWordPressDomain('HTTPS://Shop.Example.com/wp-admin')).toBe(
      'shop.example.com',
    );
    expect(normalizeWordPressDomain('example.com')).toBe('example.com');
  });

  it('rejects non-http URLs and malformed values', () => {
    expect(() => normalizeWordPressDomain('ftp://example.com')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeWordPressDomain('not a domain')).toThrow(
      BadRequestException,
    );
  });
});
