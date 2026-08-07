import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LandsService } from './lands.service';

describe('LandsService canvas validation', () => {
  const service = new LandsService(
    {} as never,
    new ConfigService(),
    {} as never,
  );
  const validate = (value: unknown) =>
    (
      service as unknown as {
        assertSafeJson(value: unknown): void;
      }
    ).assertSafeJson(value);

  it('accepts a nested JSON canvas', () => {
    expect(() =>
      validate({ elements: [{ id: 'shape-1', points: [1, 2] }] }),
    ).not.toThrow();
  });

  it('rejects prototype-pollution keys', () => {
    const canvas = JSON.parse('{"elements":[{"constructor":{}}]}');
    expect(() => validate(canvas)).toThrow('Unsafe canvas key');
  });

  it('rejects non-JSON numeric values', () => {
    expect(() => validate({ zoom: Number.NaN })).toThrow(BadRequestException);
  });
});
