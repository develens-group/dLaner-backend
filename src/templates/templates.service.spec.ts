import { ConfigService } from '@nestjs/config';
import { TemplatesService } from './templates.service';

describe('TemplatesService payload security', () => {
  const service = new TemplatesService(
    {} as never,
    new ConfigService({
      TEMPLATE_MAX_ITEMS: 2,
      TEMPLATE_MAX_ELEMENTS_PER_ITEM: 2,
    }),
    {} as never,
  );
  const validate = (value: unknown) =>
    (
      service as unknown as { validateLibrary(v: unknown): void }
    ).validateLibrary(value);
  it('accepts unicode and valid library items', () =>
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'تست',
        libraryItems: [
          {
            id: '۱',
            status: 'unpublished',
            created: 1,
            name: 'فارسی',
            elements: [],
          },
        ],
      }),
    ).not.toThrow());
  it('rejects duplicate item ids', () =>
    expect(() =>
      validate({
        libraryItems: [
          { id: 'a', elements: [] },
          { id: 'a', elements: [] },
        ],
      }),
    ).toThrow('Duplicate item id'));
  it('rejects oversized element arrays', () =>
    expect(() =>
      validate({ libraryItems: [{ id: 'a', elements: [1, 2, 3] }] }),
    ).toThrow('Invalid element count'));
  it('rejects prototype-pollution keys', () => {
    const elements: unknown = JSON.parse('[{"constructor":{"polluted":true}}]');
    expect(() => validate({ libraryItems: [{ id: 'a', elements }] })).toThrow(
      'Unsafe object key',
    );
  });
});
