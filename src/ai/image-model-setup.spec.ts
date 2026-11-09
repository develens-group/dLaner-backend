import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AiOperationsCatalogService } from './ai-operations.catalog';
import { ImageModelSetupDto } from './image-model-setup.dto';
import { ReplicateImageProvider } from './providers/image-provider.registry';
import { GoogleImageProvider } from './providers/google-image.provider';

const setup = (): ImageModelSetupDto => ({
  provider: 'replicate',
  model: 'another-owner/future-model',
  slug: 'generate-future-model',
  label: 'Future model',
  description: 'A custom model',
  selectorName: 'size',
  defaults: { num_outputs: 1, quality: 'low' },
  tiers: [
    { value: 'small', creditCost: '0.002', parameters: {} },
    { value: 'large', creditCost: '0.006', parameters: { quality: 'high' } },
  ],
  imageField: 'reference_images',
  promptField: 'text',
  imageArray: true,
  modelEndpoint: true,
  requiresPrompt: true,
});

describe('Dynamic image model catalog', () => {
  it('validates custom model metadata and nested option rows', async () => {
    expect(
      await validate(plainToInstance(ImageModelSetupDto, setup())),
    ).toHaveLength(0);
    const invalid = {
      ...setup(),
      provider: 'unknown',
      tiers: [{ value: 'bad', parameters: [] }],
    };
    const errors = await validate(plainToInstance(ImageModelSetupDto, invalid));
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['provider', 'tiers']),
    );
  });

  it('imports arbitrary models atomically, binds parameters to each tariff and reuses IDs on update', async () => {
    const upsert = jest
      .fn<
        Promise<unknown>,
        [
          {
            where: { id: string };
            create: {
              creditCost: Prisma.Decimal;
              configJson: Record<string, unknown>;
            };
            update: unknown;
          },
        ]
      >()
      .mockResolvedValue({});
    const tx = {
      aiOperationType: {
        upsert: jest.fn().mockResolvedValue({ id: 'type-1' }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'type-1', variants: [] }),
      },
      aiProviderVariant: { updateMany: jest.fn(), upsert },
    };
    const prisma = {
      $transaction: jest.fn((action: (client: typeof tx) => unknown) =>
        action(tx),
      ),
    };
    const service = new AiOperationsCatalogService(prisma as never);
    await service.importImageModel(setup());
    const first = upsert.mock.calls[0][0];
    const second = upsert.mock.calls[1][0];
    expect(second.create.creditCost.toString()).toBe('0.006');
    expect(second.create.configJson).toEqual(
      expect.objectContaining({
        managedImageModel: true,
        defaults: { num_outputs: 1, quality: 'high', size: 'large' },
        selection: { name: 'size', value: 'large' },
        input: { image: 'reference_images', prompt: 'text' },
      }),
    );
    await service.importImageModel({
      ...setup(),
      tiers: [{ value: 'small', creditCost: '0.003', parameters: {} }],
    });
    expect(upsert.mock.calls[2][0].where.id).toBe(first.where.id);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    { tiers: [{ value: 'small', creditCost: '0', parameters: {} }] },
    { tiers: [{ value: 'small', creditCost: '-1', parameters: {} }] },
    { model: 'https://other.example/model' },
    {
      tiers: [
        { value: 'x', creditCost: '1', parameters: {} },
        { value: 'x', creditCost: '2', parameters: {} },
      ],
    },
  ])(
    'rejects invalid tariffs or model IDs before starting a transaction: %p',
    async (patch) => {
      const transaction = jest.fn();
      const service = new AiOperationsCatalogService({
        $transaction: transaction,
      } as never);
      await expect(
        service.importImageModel({ ...setup(), ...patch }),
      ).rejects.toThrow();
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});

describe('Dynamic provider input configuration', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends custom Replicate mappings and parameters without a hardcoded model entry', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'succeeded',
          output: 'https://example.com/result.png',
        }),
        { status: 200 },
      ),
    );
    const provider = new ReplicateImageProvider({
      get: () => 'test-key',
    } as unknown as ConfigService);
    await provider.execute(
      {
        externalModel: 'another-owner/future-model',
        configJson: {
          modelEndpoint: true,
          imageArray: true,
          input: { image: 'reference_images', prompt: 'text' },
          defaults: { size: 'large' },
        },
      } as never,
      {
        prompt: 'A blue house',
        image: {
          mimetype: 'image/png',
          buffer: Buffer.from('test'),
        } as Express.Multer.File,
      },
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(
      'https://api.replicate.com/v1/models/another-owner/future-model/predictions',
    );
    const body = JSON.parse(request.mock.calls[0][1]?.body as string) as {
      input: Record<string, unknown>;
    };
    expect(body.input).toEqual({
      size: 'large',
      text: 'A blue house',
      reference_images: [expect.stringMatching(/^data:image\/png;base64,/)],
    });
  });

  it('passes admin-defined Google generation configuration', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { mimeType: 'image/png', data: 'dGVzdA==' } },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new GoogleImageProvider({
      get: () => 'test-key',
    } as unknown as ConfigService);
    await provider.execute(
      {
        externalModel: 'future-preview-image',
        configJson: {
          managedImageModel: true,
          defaults: { imageConfig: { imageSize: '2K' } },
        },
      } as never,
      { prompt: 'A blue house' },
    );
    const body = JSON.parse(request.mock.calls[0][1]?.body as string) as {
      generationConfig: Record<string, unknown>;
    };
    expect(request.mock.calls[0][0]).toContain(
      '/models/future-preview-image:generateContent',
    );
    expect(body.generationConfig).toEqual({
      imageConfig: { imageSize: '2K' },
      responseModalities: ['TEXT', 'IMAGE'],
    });
  });
});
