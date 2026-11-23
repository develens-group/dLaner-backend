import {
  appendLandImage,
  decodeLandImage,
  imageFile,
  landImageIndex,
  imageMetadataCanvas,
  preserveLandImageFiles,
} from './mcp-land-images';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAmkAAAAASUVORK5CYII=';
describe('account land images', () => {
  it('returns image bytes for visual MCP content', () => {
    expect(decodeLandImage(png).mimeType).toBe('image/png');
    expect(decodeLandImage(png).data).toBe(png.split(',')[1]);
  });
  it.each([
    'https://example.com/image.png',
    'file:///secret.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,YWJj',
  ])('rejects unsupported image input: %s', (value) => {
    expect(() => decodeLandImage(value)).toThrow();
  });
  it('appends persistent file bytes without losing existing content', () => {
    const original = {
      elements: [{ id: 'text', type: 'text' }],
      appState: { viewBackgroundColor: '#fff' },
      files: { old: { id: 'old' } },
    };
    const result = appendLandImage(original, png, {
      x: 10,
      y: 20,
      width: 100,
      height: 80,
    });
    expect(result.canvas.elements).toHaveLength(2);
    expect(result.canvas.files.old).toEqual({ id: 'old' });
    expect(imageFile(result.canvas, result.fileId).data).toBe(
      png.split(',')[1],
    );
    expect(original.elements).toHaveLength(1);
    expect(result.canvas.appState).toBe(original.appState);
  });
  it('does not expose unreferenced or deleted file bytes', () => {
    expect(() =>
      imageFile(
        { elements: [], files: { hidden: { dataURL: png } } },
        'hidden',
      ),
    ).toThrow();
    expect(() =>
      imageFile(
        {
          elements: [{ type: 'image', fileId: 'hidden', isDeleted: true }],
          files: { hidden: { dataURL: png } },
        },
        'hidden',
      ),
    ).toThrow();
  });
});

it('omits binary data from text context and retains it when metadata is saved', () => {
  const before = { elements: [], files: { a: { id: 'a', dataURL: png } } };
  const metadata = imageMetadataCanvas(before);
  expect(metadata.files.a.dataURL).toBeUndefined();
  expect(preserveLandImageFiles(before, metadata).files.a.dataURL).toBe(png);
  expect(
    preserveLandImageFiles(before, { elements: [], files: {} }).files.a.dataURL,
  ).toBe(png);
});

it('indexes live images separately from deleted elements and never mistakes status for saved bytes', () => {
  const canvas = {
    elements: [
      {
        id: 'girl',
        type: 'image',
        fileId: 'photo',
        status: 'error',
        title: 'Girl',
      },
      { id: 'old', type: 'image', fileId: 'old', isDeleted: true },
      { id: 'broken', type: 'image', fileId: 'missing', status: 'saved' },
      { id: 'text', type: 'text' },
    ],
    files: { photo: { landAssetId: 'asset', mimeType: 'image/png' } },
  };
  const index = landImageIndex(canvas);
  expect(index).toHaveLength(2);
  expect(index[0]).toMatchObject({
    elementId: 'girl',
    fileId: 'photo',
    storage: 'bucket_reference',
  });
  expect(index[1]).toMatchObject({
    elementId: 'broken',
    storage: 'missing_bytes',
  });
  expect(index[0].nextStep).toContain('get_land_image');
});
