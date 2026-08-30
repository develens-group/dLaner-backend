# Fake AI Image Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-protected fake AI image endpoints (`GET/POST /api/v1/ai/fake`) that validate multipart inputs by type, charge fixed credits, and return random loremflickr image URLs for frontend/Swagger testing.

**Architecture:** Static catalog of operation types drives validation, Swagger templates, and credit costs. A dedicated `FakeAiController` + `FakeAiService` under `src/ai/` use `CreditService.reserveCredits` / `captureReservation` / `releaseReservation` (same pattern as `AiService`) without persisting `AiRequest` rows. Image bytes are checked for MIME/size only; response is JSON with `imageUrl`.

**Tech Stack:** NestJS 11, multer (`FileInterceptor` + `memoryStorage`), class-validator/Swagger, Jest, existing `CreditsModule` / `response()` envelope.

**Spec:** `docs/superpowers/specs/2026-08-30-fake-ai-image-endpoints-design.md`

## Global Constraints

- Single POST endpoint with form field `type` (not per-type routes)
- Auth: JWT Bearer required (global `JwtAuthGuard`; no `@Public`)
- Upload: `multipart/form-data` only; file field name `image`
- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`; max 10MB
- Response: JSON `{ type, imageUrl, width, height, creditCost }` via `response()`
- Image source: `https://loremflickr.com/{width}/{height}?lock={randomInt}`
- Credits: fixed per type; `referenceType` = `FAKE_AI_REQUEST`
- Mirror `AiService`: charge only when `AI_CREDIT_CHARGING_ENABLED` is not `'false'`
- No `AiRequest` persistence; no real model calls
- Envelope: existing `response(data, meta)`
- YAGNI: no binary responses, no user-key billing, no Prisma enum changes

## File map

| File | Responsibility |
|------|----------------|
| `src/ai/fake-ai.catalog.ts` | Type ids, labels, creditCost, field defs, examples, helpers |
| `src/ai/fake-ai.dto.ts` | Multipart body DTO + Swagger-friendly enums |
| `src/ai/fake-ai.service.ts` | Validate → reserve → loremflickr URL → capture/release |
| `src/ai/fake-ai.controller.ts` | `GET types`, `POST /` with multipart + Swagger |
| `src/ai/fake-ai.service.spec.ts` | Unit tests for catalog validation + execute flow |
| `src/ai/ai.module.ts` | Register controller + service |

---

### Task 1: Fake AI catalog

**Files:**
- Create: `src/ai/fake-ai.catalog.ts`
- Create: `src/ai/fake-ai.service.spec.ts` (catalog tests first)

**Interfaces:**
- Consumes: nothing external
- Produces:
  - `FakeAiTypeId` union of the 8 type strings
  - `FakeAiFieldDef`, `FakeAiTypeDefinition`
  - `FAKE_AI_TYPES: FakeAiTypeDefinition[]`
  - `getFakeAiType(id: string): FakeAiTypeDefinition | undefined`
  - `listFakeAiTypes(): FakeAiTypeDefinition[]`
  - `buildLoremFlickrUrl(width: number, height: number, lock: number): string`

- [ ] **Step 1: Write failing catalog tests**

Create `src/ai/fake-ai.service.spec.ts` with an initial describe that imports catalog helpers (will fail until file exists):

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/ai/fake-ai.service.spec.ts -t "fake-ai.catalog" --runInBand`

Expected: FAIL (cannot find module `./fake-ai.catalog`)

- [ ] **Step 3: Implement catalog**

Create `src/ai/fake-ai.catalog.ts`:

```typescript
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
    fields: [
      { name: 'image', in: 'formData', type: 'file', required: true },
    ],
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
    fields: [
      { name: 'image', in: 'formData', type: 'file', required: true },
    ],
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
```

- [ ] **Step 4: Run catalog tests — expect PASS**

Run: `npx jest src/ai/fake-ai.service.spec.ts -t "fake-ai.catalog" --runInBand`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai/fake-ai.catalog.ts src/ai/fake-ai.service.spec.ts
git commit -m "$(cat <<'EOF'
feat: add fake AI image type catalog

EOF
)"
```

---

### Task 2: FakeAiService validation + credit execute

**Files:**
- Create: `src/ai/fake-ai.service.ts`
- Modify: `src/ai/fake-ai.service.spec.ts`

**Interfaces:**
- Consumes: `getFakeAiType`, `buildLoremFlickrUrl`, `CreditService`, `ConfigService`
- Produces:
  - `FakeAiService.listTypes(): FakeAiTypeDefinition[]`
  - `FakeAiService.execute(userId, input): Promise<FakeAiResult>`
  - `FakeAiExecuteInput`: `{ type: string; prompt?: string; style?: string; strength?: string; scale?: string; width?: string; height?: string; image?: Express.Multer.File }`
  - `FakeAiResult`: `{ type: FakeAiTypeId; imageUrl: string; width: number; height: number; creditCost: number }`

- [ ] **Step 1: Write failing service tests**

Append to `src/ai/fake-ai.service.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeAiService } from './fake-ai.service';

describe('FakeAiService', () => {
  const credits = {
    reserveCredits: jest.fn(),
    captureReservation: jest.fn(),
    releaseReservation: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'AI_CREDIT_CHARGING_ENABLED') return 'true';
      return fallback;
    }),
  };

  const pngFile = {
    fieldname: 'image',
    originalname: 'a.png',
    mimetype: 'image/png',
    size: 100,
    buffer: Buffer.from([1, 2, 3]),
  } as Express.Multer.File;

  let service: FakeAiService;

  beforeEach(() => {
    jest.clearAllMocks();
    credits.reserveCredits.mockResolvedValue({ id: 'res-1', amount: 2 });
    credits.captureReservation.mockResolvedValue({});
    credits.releaseReservation.mockResolvedValue({});
    service = new FakeAiService(
      credits as never,
      config as unknown as ConfigService,
    );
  });

  it('lists types for GET', () => {
    expect(service.listTypes()).toHaveLength(8);
    expect(service.listTypes()[0]).toHaveProperty('creditCost');
    expect(service.listTypes()[0]).toHaveProperty('fields');
    expect(service.listTypes()[0]).toHaveProperty('example');
  });

  it('rejects unknown type without reserving', async () => {
    await expect(
      service.execute('user-1', { type: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('rejects remove-background without image', async () => {
    await expect(
      service.execute('user-1', { type: 'remove-background' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('rejects remove-object without prompt', async () => {
    await expect(
      service.execute('user-1', {
        type: 'remove-object',
        image: pngFile,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('rejects invalid mime', async () => {
    await expect(
      service.execute('user-1', {
        type: 'enhance-image',
        image: { ...pngFile, mimetype: 'application/pdf' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('reserves, captures, and returns loremflickr url', async () => {
    const result = await service.execute('user-1', {
      type: 'remove-background',
      image: pngFile,
    });
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      'user-1',
      2,
      expect.stringMatching(/^fake-ai:/),
      'FAKE_AI_REQUEST',
      expect.any(String),
    );
    expect(credits.captureReservation).toHaveBeenCalledWith(
      'user-1',
      'res-1',
      2,
      expect.stringMatching(/:capture$/),
    );
    expect(result.type).toBe('remove-background');
    expect(result.creditCost).toBe(2);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.imageUrl).toMatch(
      /^https:\/\/loremflickr\.com\/512\/512\?lock=\d+$/,
    );
  });

  it('uses generate-image width/height when provided', async () => {
    credits.reserveCredits.mockResolvedValue({ id: 'res-2', amount: 4 });
    const result = await service.execute('user-1', {
      type: 'generate-image',
      prompt: 'cat',
      width: '640',
      height: '480',
    });
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.imageUrl).toContain('/640/480?lock=');
  });

  it('skips credits when charging disabled', async () => {
    config.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'AI_CREDIT_CHARGING_ENABLED') return 'false';
      return fallback;
    });
    service = new FakeAiService(
      credits as never,
      config as unknown as ConfigService,
    );
    const result = await service.execute('user-1', {
      type: 'generate-image',
      prompt: 'dog',
    });
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(result.creditCost).toBe(4);
    expect(result.imageUrl).toContain('loremflickr.com');
  });

  it('releases reservation when capture fails', async () => {
    credits.captureReservation.mockRejectedValue(new Error('capture boom'));
    await expect(
      service.execute('user-1', {
        type: 'remove-background',
        image: pngFile,
      }),
    ).rejects.toThrow('capture boom');
    expect(credits.releaseReservation).toHaveBeenCalledWith(
      'user-1',
      'res-1',
      expect.stringMatching(/:release$/),
    );
  });

  it('rejects invalid scale for upscale-image', async () => {
    await expect(
      service.execute('user-1', {
        type: 'upscale-image',
        image: pngFile,
        scale: '3',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects strength out of range', async () => {
    await expect(
      service.execute('user-1', {
        type: 'image-to-image',
        image: pngFile,
        prompt: 'x',
        strength: '1.5',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run service tests — expect FAIL**

Run: `npx jest src/ai/fake-ai.service.spec.ts -t "FakeAiService" --runInBand`

Expected: FAIL (cannot find module `./fake-ai.service`)

- [ ] **Step 3: Implement FakeAiService**

Create `src/ai/fake-ai.service.ts`:

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'node:crypto';
import { CreditService } from '../credits/credit.service';
import {
  FakeAiTypeDefinition,
  FakeAiTypeId,
  buildLoremFlickrUrl,
  getFakeAiType,
  listFakeAiTypes,
} from './fake-ai.catalog';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

export interface FakeAiExecuteInput {
  type: string;
  prompt?: string;
  style?: string;
  strength?: string;
  scale?: string;
  width?: string;
  height?: string;
  image?: Express.Multer.File;
}

export interface FakeAiResult {
  type: FakeAiTypeId;
  imageUrl: string;
  width: number;
  height: number;
  creditCost: number;
}

@Injectable()
export class FakeAiService {
  constructor(
    private readonly credits: CreditService,
    private readonly config: ConfigService,
  ) {}

  listTypes(): FakeAiTypeDefinition[] {
    return listFakeAiTypes();
  }

  async execute(
    userId: string,
    input: FakeAiExecuteInput,
  ): Promise<FakeAiResult> {
    const def = getFakeAiType(input.type);
    if (!def)
      throw new BadRequestException(`Unknown fake AI type: ${input.type}`);
    this.validate(def, input);

    const chargingEnabled =
      this.config.get('AI_CREDIT_CHARGING_ENABLED', 'true') !== 'false';
    const { width, height } = this.resolveSize(def, input);
    const operationKey = `fake-ai:${userId}:${randomUUID()}`;

    const reservation = chargingEnabled
      ? await this.credits.reserveCredits(
          userId,
          def.creditCost,
          `${operationKey}:reserve`,
          'FAKE_AI_REQUEST',
          operationKey,
        )
      : undefined;

    try {
      const imageUrl = buildLoremFlickrUrl(width, height, randomInt(1, 1_000_000_000));
      if (reservation) {
        await this.credits.captureReservation(
          userId,
          reservation.id,
          def.creditCost,
          `${operationKey}:capture`,
        );
      }
      return {
        type: def.id,
        imageUrl,
        width,
        height,
        creditCost: def.creditCost,
      };
    } catch (error) {
      if (reservation) {
        await this.credits
          .releaseReservation(userId, reservation.id, `${operationKey}:release`)
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private validate(def: FakeAiTypeDefinition, input: FakeAiExecuteInput) {
    for (const field of def.fields) {
      if (field.name === 'image') {
        if (field.required && !input.image)
          throw new BadRequestException('image file is required');
        if (input.image) this.assertImage(input.image);
        continue;
      }
      const raw = (input as Record<string, unknown>)[field.name];
      if (field.required && (raw === undefined || raw === null || raw === ''))
        throw new BadRequestException(`${field.name} is required`);
      if (raw === undefined || raw === null || raw === '') continue;
      if (field.type === 'string') {
        if (typeof raw !== 'string' || !raw.trim())
          throw new BadRequestException(`${field.name} must be a non-empty string`);
        continue;
      }
      if (field.type === 'number') {
        const num = Number(raw);
        if (!Number.isFinite(num))
          throw new BadRequestException(`${field.name} must be a number`);
        if (field.enum && !field.enum.includes(num))
          throw new BadRequestException(
            `${field.name} must be one of: ${field.enum.join(', ')}`,
          );
        if (field.minimum !== undefined && num < field.minimum)
          throw new BadRequestException(
            `${field.name} must be >= ${field.minimum}`,
          );
        if (field.maximum !== undefined && num > field.maximum)
          throw new BadRequestException(
            `${field.name} must be <= ${field.maximum}`,
          );
      }
    }
  }

  private assertImage(file: Express.Multer.File) {
    if (!ALLOWED_MIME.has(file.mimetype))
      throw new BadRequestException(
        'image must be image/jpeg, image/png, or image/webp',
      );
    if (file.size > MAX_BYTES)
      throw new BadRequestException('image must be at most 10MB');
  }

  private resolveSize(
    def: FakeAiTypeDefinition,
    input: FakeAiExecuteInput,
  ): { width: number; height: number } {
    let width = def.defaultWidth;
    let height = def.defaultHeight;
    if (input.width !== undefined && input.width !== '') {
      const w = Number(input.width);
      if (!Number.isFinite(w)) throw new BadRequestException('width must be a number');
      width = w;
    }
    if (input.height !== undefined && input.height !== '') {
      const h = Number(input.height);
      if (!Number.isFinite(h)) throw new BadRequestException('height must be a number');
      height = h;
    }
    return { width, height };
  }
}
```

- [ ] **Step 4: Run service tests — expect PASS**

Run: `npx jest src/ai/fake-ai.service.spec.ts --runInBand`

Expected: PASS (catalog + service)

- [ ] **Step 5: Commit**

```bash
git add src/ai/fake-ai.service.ts src/ai/fake-ai.service.spec.ts
git commit -m "$(cat <<'EOF'
feat: implement fake AI service with credit charging

EOF
)"
```

---

### Task 3: DTO + controller + module wiring

**Files:**
- Create: `src/ai/fake-ai.dto.ts`
- Create: `src/ai/fake-ai.controller.ts`
- Modify: `src/ai/ai.module.ts`

**Interfaces:**
- Consumes: `FakeAiService.listTypes`, `FakeAiService.execute`
- Produces:
  - Routes: `GET /api/v1/ai/fake/types`, `POST /api/v1/ai/fake`
  - Swagger tag `ai-fake`, `@ApiBearerAuth`, multipart body with `type` enum + `image` binary

- [ ] **Step 1: Create DTO**

Create `src/ai/fake-ai.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { FAKE_AI_TYPE_IDS } from './fake-ai.catalog';

export class FakeAiExecuteDto {
  @ApiProperty({
    enum: FAKE_AI_TYPE_IDS,
    example: 'remove-background',
    description: 'Fake AI operation type',
  })
  @IsString()
  @IsIn([...FAKE_AI_TYPE_IDS])
  type!: string;

  @ApiPropertyOptional({
    example: 'remove the person on the left',
    description: 'Required for remove-object, generate-image, image-to-image, replace-background',
  })
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  prompt?: string;

  @ApiPropertyOptional({ example: 'pencil' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  style?: string;

  @ApiPropertyOptional({
    example: '0.7',
    description: 'image-to-image strength 0..1 (sent as form string)',
  })
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional({
    example: '2',
    description: 'upscale-image scale: 2 or 4',
  })
  @IsOptional()
  @IsString()
  scale?: string;

  @ApiPropertyOptional({ example: '512' })
  @IsOptional()
  @IsString()
  width?: string;

  @ApiPropertyOptional({ example: '512' })
  @IsOptional()
  @IsString()
  height?: string;
}
```

Note: file field `image` is declared only in `@ApiBody` schema on the controller (multer), not as a validated DTO property.

- [ ] **Step 2: Create controller**

Create `src/ai/fake-ai.controller.ts`:

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { response } from '../common/api-response';
import type { AccessPrincipal } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { FAKE_AI_TYPE_IDS } from './fake-ai.catalog';
import { FakeAiExecuteDto } from './fake-ai.dto';
import { FakeAiService } from './fake-ai.service';

@ApiTags('ai-fake')
@ApiBearerAuth()
@Controller('api/v1/ai/fake')
export class FakeAiController {
  constructor(private readonly fakeAi: FakeAiService) {}

  @Get('types')
  @ApiOperation({
    summary: 'List fake AI types with credit costs and input templates',
  })
  listTypes() {
    return response(this.fakeAi.listTypes());
  }

  @Post()
  @ApiOperation({
    summary: 'Run a fake AI image operation (returns random loremflickr URL)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type'],
      properties: {
        type: {
          type: 'string',
          enum: [...FAKE_AI_TYPE_IDS],
          example: 'remove-background',
        },
        image: { type: 'string', format: 'binary' },
        prompt: { type: 'string', example: 'remove the person on the left' },
        style: { type: 'string', example: 'pencil' },
        strength: { type: 'string', example: '0.7' },
        scale: { type: 'string', example: '2' },
        width: { type: 'string', example: '512' },
        height: { type: 'string', example: '512' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async execute(
    @CurrentUser() user: AccessPrincipal,
    @Body() dto: FakeAiExecuteDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (!dto?.type)
      throw new BadRequestException('type is required');
    return response(
      await this.fakeAi.execute(user.userId, {
        type: dto.type,
        prompt: dto.prompt,
        style: dto.style,
        strength: dto.strength,
        scale: dto.scale,
        width: dto.width,
        height: dto.height,
        image,
      }),
    );
  }
}
```

- [ ] **Step 3: Register in AiModule**

Modify `src/ai/ai.module.ts`:

- Import `FakeAiController`, `FakeAiService`
- Add `FakeAiController` to `controllers`
- Add `FakeAiService` to `providers`

```typescript
import { FakeAiController } from './fake-ai.controller';
import { FakeAiService } from './fake-ai.service';

@Module({
  imports: [CreditsModule],
  controllers: [
    AiController,
    AiCredentialsController,
    AdminAiController,
    FakeAiController,
  ],
  providers: [
    // ...existing providers...
    FakeAiService,
  ],
  exports: [AiService],
})
export class AiModule {}
```

- [ ] **Step 4: Build to verify compile**

Run: `npm run build`

Expected: compile success, no TS errors for new files

- [ ] **Step 5: Re-run unit tests**

Run: `npx jest src/ai/fake-ai.service.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ai/fake-ai.dto.ts src/ai/fake-ai.controller.ts src/ai/ai.module.ts
git commit -m "$(cat <<'EOF'
feat: expose fake AI multipart endpoints in Swagger

EOF
)"
```

---

### Task 4: Manual Swagger smoke checklist (no e2e required)

**Files:** none (verification only)

- [ ] **Step 1: Start app**

Run: `npm run start:dev`

- [ ] **Step 2: Open OpenAPI JSON and confirm paths**

Open: `http://localhost:<port>/api/docs-json` (or project’s swagger JSON path `/api/docs` raw json)

Confirm:
- `GET /api/v1/ai/fake/types`
- `POST /api/v1/ai/fake` with `multipart/form-data` and `image` binary
- Bearer security on both

- [ ] **Step 3: Manual Try-it-out matrix**

With a valid JWT and credit balance:

| type | form fields | expect |
|------|-------------|--------|
| `remove-background` | `image` | 200 + imageUrl, credit −2 |
| `remove-object` | `image` + `prompt` | 200, credit −3 |
| `generate-image` | `prompt` only | 200, credit −4 |
| `remove-background` | no image | 400, no credit change |
| any | no/low credits | 422 Insufficient available credits |

- [ ] **Step 4: Commit nothing** (verification only). If OpenAPI path naming differs in this repo, adjust controller decorators only and commit that fix under `fix: correct fake AI swagger path docs`.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Fixed POST + `type` | Task 3 |
| GET types with creditCost + templates | Task 1 catalog + Task 2/3 |
| multipart + Swagger binary | Task 3 |
| JWT required | Task 3 (no `@Public`) |
| Per-type inputs/costs | Task 1 |
| loremflickr JSON response | Task 2 |
| reserve/capture/release credits | Task 2 |
| `AI_CREDIT_CHARGING_ENABLED` mirror | Task 2 |
| MIME/size validation | Task 2 |
| No AiRequest persistence | Task 2 (by omission) |

## Placeholder / consistency self-review

- No TBD/TODO left in tasks
- Credit method signatures match `CreditService.reserveCredits(userId, amount, key, referenceType, referenceId)` and `captureReservation(userId, reservationId, actualAmount, key)`
- Field name `image` consistent across catalog, controller interceptor, and tests
- Type ids identical in catalog, DTO `@IsIn`, and Swagger enum
