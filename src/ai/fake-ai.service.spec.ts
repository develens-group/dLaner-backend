import {
  FAKE_AI_TYPES,
  buildLoremFlickrUrl,
  getFakeAiType,
  listFakeAiTypes,
} from './fake-ai.catalog';

describe('fake-ai.catalog', () => {
  it('exposes all eight types with credit costs', () => {
    expect(listFakeAiTypes()).toHaveLength(8);
    expect(getFakeAiType('remove-background')?.creditCost).toBe(2);
    expect(getFakeAiType('remove-object')?.creditCost).toBe(3);
    expect(getFakeAiType('sketch-image')?.creditCost).toBe(2);
    expect(getFakeAiType('generate-image')?.creditCost).toBe(4);
    expect(getFakeAiType('image-to-image')?.creditCost).toBe(4);
    expect(getFakeAiType('upscale-image')?.creditCost).toBe(3);
    expect(getFakeAiType('enhance-image')?.creditCost).toBe(2);
    expect(getFakeAiType('replace-background')?.creditCost).toBe(3);
  });

  it('requires image for remove-background and prompt for remove-object', () => {
    const bg = getFakeAiType('remove-background')!;
    expect(bg.fields.find((f) => f.name === 'image')?.required).toBe(true);
    const obj = getFakeAiType('remove-object')!;
    expect(obj.fields.find((f) => f.name === 'prompt')?.required).toBe(true);
    expect(obj.fields.find((f) => f.name === 'image')?.required).toBe(true);
  });

  it('builds loremflickr urls', () => {
    expect(buildLoremFlickrUrl(512, 512, 42)).toBe(
      'https://loremflickr.com/512/512?lock=42',
    );
  });

  it('returns undefined for unknown type', () => {
    expect(getFakeAiType('nope')).toBeUndefined();
    expect(FAKE_AI_TYPES.length).toBe(8);
  });
});
