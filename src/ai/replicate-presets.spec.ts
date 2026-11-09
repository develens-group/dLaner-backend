import { ConfigService } from '@nestjs/config';
import { AiProviderVariant } from '@prisma/client';
import { pricedPreset, REPLICATE_PRESETS } from './replicate-presets';
import { AiOperationsCatalogService } from './ai-operations.catalog';
import { ReplicateImageProvider } from './providers/image-provider.registry';

describe('Replicate priced model presets', () => {
  it('preserves decimal tariffs and stable identities on reimport', () => {
    const first = pricedPreset('nano-banana-2-1', {
      '1K': '0.002',
      '4K': '0.009',
    });
    const second = pricedPreset('nano-banana-2-1', { '1K': '0.003' });
    expect(first.entries.map((entry) => entry.value)).toEqual(['1K', '4K']);
    expect(first.entries[0].cost.toString()).toBe('0.002');
    expect(first.entries[0].variantId).toBe(second.entries[0].variantId);
    expect(first.entries[0].variantId).not.toBe(first.entries[1].variantId);
  });

  it.each([{}, { '1K': '0' }, { '1K': '-1' }, { '1K': 'NaN' }, { '8K': '1' }])(
    'rejects missing, invalid or unsupported tariffs: %p',
    (prices) => {
      expect(() => pricedPreset('nano-banana-2-1', prices)).toThrow();
    },
  );

  it('imports server-bound quality tiers without deleting omitted options', async () => {
    const tx = {
      aiOperationType: {
        upsert: jest.fn().mockResolvedValue({ id: 'type-1' }),
      },
      aiProviderVariant: { updateMany: jest.fn(), upsert: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((action: (client: typeof tx) => unknown) =>
        action(tx),
      ),
      aiOperationType: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'type-1' }),
      },
    };
    const service = new AiOperationsCatalogService(prisma as never);
    jest.spyOn(service, 'getType').mockResolvedValue({ id: 'type-1' } as never);
    await service.importModelPreset('gpt-image-2-5-flare', {
      low: '0.002',
      medium: '0.004',
    });
    expect(tx.aiProviderVariant.upsert).toHaveBeenCalledTimes(2);
    const entries = tx.aiProviderVariant.upsert.mock.calls.map(
      ([arg]) =>
        (
          arg as {
            create: { creditCost: { toString(): string }; isDefault: boolean };
          }
        ).create,
    );
    expect(entries[1]).toEqual(
      expect.objectContaining({
        label: 'medium',
        configJson: {
          defaults: {
            quality: 'medium',
            aspect_ratio: '1:1',
            number_of_images: 1,
          },
          selection: { name: 'quality', value: 'medium' },
        },
      }),
    );
    expect(entries[1].creditCost.toString()).toBe('0.004');
    expect(entries[0].isDefault).toBe(true);
    expect(entries[1].isDefault).toBe(false);
  });
});

describe('Replicate model request payloads', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(REPLICATE_PRESETS)(
    'sends the priced parameter and optional reference array for $model',
    async (preset) => {
      const request = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'prediction-1',
            status: 'succeeded',
            output: ['https://example.com/result.png'],
          }),
          { status: 200 },
        ),
      );
      const provider = new ReplicateImageProvider({
        get: () => 'test-token',
      } as unknown as ConfigService);
      const value = preset.options[0];
      await provider.execute(
        {
          externalModel: preset.model,
          configJson: {
            defaults: { [preset.parameter]: value, aspect_ratio: '1:1' },
          },
        } as unknown as AiProviderVariant,
        {
          prompt: 'A blue house',
          image: {
            mimetype: 'image/png',
            buffer: Buffer.from('test-image'),
          } as Express.Multer.File,
        },
      );
      expect(request).toHaveBeenCalledTimes(1);
      const [url, options] = request.mock.calls[0];
      expect(url).toBe(
        `https://api.replicate.com/v1/models/${preset.model}/predictions`,
      );
      const body = JSON.parse(options?.body as string) as {
        input: Record<string, unknown>;
        version?: string;
      };
      const imageKey =
        preset.parameter === 'resolution' ? 'image_input' : 'input_images';
      expect(body.input).toEqual(
        expect.objectContaining({
          [preset.parameter]: value,
          prompt: 'A blue house',
          [imageKey]: [expect.stringMatching(/^data:image\/png;base64,/)],
        }),
      );
      expect(body.version).toBeUndefined();
    },
  );

  it('preserves versioned community model image payloads', async () => {
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
      get: () => 'test-token',
    } as unknown as ConfigService);
    const version = 'a'.repeat(64);
    await provider.execute(
      {
        externalModel: 'men1scus/birefnet',
        configJson: { version },
      } as unknown as AiProviderVariant,
      {
        image: {
          mimetype: 'image/png',
          buffer: Buffer.from('test'),
        } as Express.Multer.File,
      },
    );
    expect(request.mock.calls[0][0]).toBe(
      'https://api.replicate.com/v1/predictions',
    );
    const body = JSON.parse(request.mock.calls[0][1]?.body as string) as {
      input: Record<string, unknown>;
      version?: string;
    };
    expect(body.version).toBe(version);
    expect(typeof body.input.image).toBe('string');
  });
});
