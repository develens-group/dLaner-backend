import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

export function decodeLandImage(dataURL: unknown, maxBytes = 1_000_000) {
  if (
    typeof dataURL !== 'string' ||
    dataURL.length > Math.ceil((maxBytes * 4) / 3) + 128
  )
    throw new BadRequestException(
      'Use an embedded PNG, JPEG, WebP or GIF image up to 1 MB.',
    );
  const match =
    /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      dataURL,
    );
  if (!match)
    throw new BadRequestException(
      'Expected an embedded base64 image, not a URL or local path.',
    );
  const bytes = Buffer.from(match[2], 'base64');
  const valid =
    bytes.length > 0 &&
    bytes.length <= maxBytes &&
    bytes.toString('base64') === match[2] &&
    ((match[1] === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
      (match[1] === 'image/jpeg' &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255) ||
      (match[1] === 'image/gif' &&
        ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) ||
      (match[1] === 'image/webp' &&
        bytes.subarray(0, 4).toString() === 'RIFF' &&
        bytes.subarray(8, 12).toString() === 'WEBP'));
  if (!valid)
    throw new BadRequestException(
      'Invalid image bytes or unsupported image size.',
    );
  return { mimeType: match[1], data: match[2], bytes };
}
export function imageFile(canvas: Record<string, unknown>, fileId: string) {
  const elements = Array.isArray(canvas.elements)
    ? (canvas.elements as Record<string, unknown>[])
    : [];
  if (
    !elements.some(
      (el) => el.type === 'image' && !el.isDeleted && el.fileId === fileId,
    )
  )
    throw new BadRequestException(
      'Choose a fileId referenced by a visible image in this land.',
    );
  const files = (canvas.files ?? {}) as Record<string, { dataURL?: unknown }>;
  return decodeLandImage(files[fileId]?.dataURL, 8_000_000);
}
export function appendLandImage(
  canvas: Record<string, unknown>,
  dataURL: string,
  box: { x: number; y: number; width: number; height: number },
  maxBytes = 1_000_000,
) {
  const image = decodeLandImage(dataURL, maxBytes);
  const fileId = createHash('sha256').update(image.bytes).digest('hex');
  const elementId = randomUUID();
  const now = Date.now();
  const element = {
    id: elementId,
    type: 'image',
    ...box,
    fileId,
    status: 'saved',
    scale: [1, 1],
    crop: null,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
  };
  return {
    elementId,
    fileId,
    canvas: {
      ...canvas,
      elements: [
        ...(Array.isArray(canvas.elements)
          ? (canvas.elements as unknown[])
          : []),
        element,
      ],
      files: {
        ...((canvas.files as Record<string, unknown>) ?? {}),
        [fileId]: {
          id: fileId,
          dataURL,
          mimeType: image.mimeType,
          created: now,
          lastRetrieved: now,
        },
      },
    },
  };
}

/** Keep base64 out of model text context; retrieve it via native image content. */
export function imageMetadataCanvas(canvas: Record<string, unknown>) {
  const files = (canvas.files ?? {}) as Record<string, Record<string, unknown>>;
  return {
    ...canvas,
    files: Object.fromEntries(
      Object.entries(files).map(([key, file]) => {
        const metadata = { ...file };
        delete metadata.dataURL;
        return [key, metadata];
      }),
    ),
  };
}
export function preserveLandImageFiles(
  before: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  const oldFiles = (before.files ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const files = { ...oldFiles };
  for (const [key, file] of Object.entries(
    (next.files ?? {}) as Record<string, Record<string, unknown>>,
  )) {
    files[key] = { ...oldFiles[key], ...file };
  }
  return { ...next, files };
}
