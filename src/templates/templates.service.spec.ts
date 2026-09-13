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
  it('rejects missing item names', () =>
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'dlander',
        libraryItems: [{ id: 'a', status: 'published', elements: [] }],
      }),
    ).toThrow('Item name is required'));
  it('decodes preview base64 with declared mime', () => {
    const png1x1 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const resolve = (
      service as unknown as {
        resolvePreviewInput(
          file: undefined,
          dto: {
            previewImageBase64?: string;
            previewImageType?: string;
          },
        ): { buffer: Buffer; mime: string } | undefined;
      }
    ).resolvePreviewInput.bind(service);
    const out = resolve(undefined, {
      previewImageBase64: png1x1,
      previewImageType: 'image/png',
    });
    expect(out?.mime).toBe('image/png');
    expect(out?.buffer.length).toBeGreaterThan(10);
  });
  it('rejects duplicate item ids', () =>
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'dlander',
        libraryItems: [
          { id: 'a', status: 'published', name: 'A', elements: [] },
          { id: 'a', status: 'published', name: 'B', elements: [] },
        ],
      }),
    ).toThrow('Duplicate item id'));
  it('rejects oversized element arrays', () =>
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'dlander',
        libraryItems: [
          { id: 'a', status: 'published', name: 'A', elements: [1, 2, 3] },
        ],
      }),
    ).toThrow('Invalid element count'));
  it('rejects prototype-pollution keys', () => {
    const elements: unknown = JSON.parse('[{"constructor":{"polluted":true}}]');
    expect(() =>
      validate({
        type: 'dlanderlib',
        version: 2,
        source: 'dlander',
        libraryItems: [
          { id: 'a', status: 'published', name: 'A', elements },
        ],
      }),
    ).toThrow('Unsafe object key');
  });
});
