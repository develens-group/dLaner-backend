export const FAKE_AI_TYPE_IDS = [
  'remove-background',
  'remove-object',
  'sketch-image',
  'generate-image',
  'image-to-image',
  'upscale-image',
  'enhance-image',
  'replace-background',
] as const;

export type FakeAiTypeId = (typeof FAKE_AI_TYPE_IDS)[number];

export type FakeAiFieldType = 'file' | 'string' | 'number';

export interface FakeAiFieldDef {
  name: string;
  in: 'formData';
  type: FakeAiFieldType;
  required: boolean;
  example?: string | number;
  enum?: Array<string | number>;
  minimum?: number;
  maximum?: number;
}

export interface FakeAiTypeDefinition {
  id: FakeAiTypeId;
  label: string;
  description: string;
  creditCost: number;
  fields: FakeAiFieldDef[];
  example: Record<string, string | number>;
  defaultWidth: number;
  defaultHeight: number;
}

export const FAKE_AI_TYPES: FakeAiTypeDefinition[] = [
  {
    id: 'remove-background',
    label: 'Remove Background',
    description: 'Remove the background from an image',
    creditCost: 2,
    defaultWidth: 512,
    defaultHeight: 512,
    fields: [{ name: 'image', in: 'formData', type: 'file', required: true }],
    example: { type: 'remove-background' },
  },
  {
    id: 'remove-object',
    label: 'Remove Object',
    description: 'Remove an object described by prompt',
    creditCost: 3,
    defaultWidth: 512,
    defaultHeight: 512,
    fields: [
      { name: 'image', in: 'formData', type: 'file', required: true },
      {
        name: 'prompt',
        in: 'formData',
        type: 'string',
        required: true,
        example: 'remove the person on the left',
      },
    ],
    example: {
      type: 'remove-object',
      prompt: 'remove the person on the left',
    },
  },
  {
    id: 'sketch-image',
    label: 'Sketch Image',
    description: 'Convert an image to a sketch',
    creditCost: 2,
    defaultWidth: 512,
    defaultHeight: 512,
    fields: [
      { name: 'image', in: 'formData', type: 'file', required: true },
      {
        name: 'style',
        in: 'formData',
        type: 'string',
        required: false,
        example: 'pencil',
      },
    ],
    example: { type: 'sketch-image', style: 'pencil' },
  },
  {
    id: 'generate-image',
    label: 'Generate Image',
    description: 'Generate an image from a text prompt',
    creditCost: 4,
    defaultWidth: 512,
    defaultHeight: 512,
    fields: [
      {
        name: 'prompt',
        in: 'formData',
        type: 'string',
        required: true,
        example: 'a red sneaker on white background',
      },
      {
        name: 'width',
        in: 'formData',
        type: 'number',
        required: false,
        example: 512,
        minimum: 64,
        maximum: 2048,
      },
      {
        name: 'height',
        in: 'formData',
        type: 'number',
        required: false,
        example: 512,
        minimum: 64,
        maximum: 2048,
      },
    ],
    example: {
      type: 'generate-image',
      prompt: 'a red sneaker on white background',
      width: 512,
      height: 512,
    },
  },
  {
    id: 'image-to-image',
    label: 'Image to Image',
    description: 'Transform an image using a prompt',
    creditCost: 4,
    defaultWidth: 512,
    defaultHeight: 512,
    fields: [
      { name: 'image', in: 'formData', type: 'file', required: true },
      {
        name: 'prompt',
        in: 'formData',
        type: 'string',
        required: true,
        example: 'make it look like watercolor',
      },
      {
        name: 'strength',
        in: 'formData',
        type: 'number',
        required: false,
        example: 0.7,
        minimum: 0,
        maximum: 1,
      },
    ],
    example: {
      type: 'image-to-image',
      prompt: 'make it look like watercolor',
      strength: 0.7,
    },
  },
  {
    id: 'upscale-image',
    label: 'Upscale Image',
    description: 'Upscale an image by 2x or 4x',
    creditCost: 3,
    defaultWidth: 1024,
    defaultHeight: 1024,
    fields: [
      { name: 'image', in: 'formData', type: 'file', required: true },
      {
        name: 'scale',
        in: 'formData',
        type: 'number',
        required: false,
        example: 2,
        enum: [2, 4],
      },
    ],
    example: { type: 'upscale-image', scale: 2 },
  },
  {
    id: 'enhance-image',
    label: 'Enhance Image',
    description: 'Enhance image quality',
    creditCost: 2,
    defaultWidth: 512,
    defaultHeight: 512,
    fields: [{ name: 'image', in: 'formData', type: 'file', required: true }],
    example: { type: 'enhance-image' },
  },
  {
    id: 'replace-background',
    label: 'Replace Background',
    description: 'Replace background using a prompt',
    creditCost: 3,
    defaultWidth: 512,
    defaultHeight: 512,
    fields: [
      { name: 'image', in: 'formData', type: 'file', required: true },
      {
        name: 'prompt',
        in: 'formData',
        type: 'string',
        required: true,
        example: 'tropical beach at sunset',
      },
    ],
    example: {
      type: 'replace-background',
      prompt: 'tropical beach at sunset',
    },
  },
];

export function listFakeAiTypes(): FakeAiTypeDefinition[] {
  return FAKE_AI_TYPES;
}

export function getFakeAiType(id: string): FakeAiTypeDefinition | undefined {
  return FAKE_AI_TYPES.find((t) => t.id === id);
}

export function buildLoremFlickrUrl(
  width: number,
  height: number,
  lock: number,
): string {
  return `https://loremflickr.com/${width}/${height}?lock=${lock}`;
}
