import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiBillingMode } from '@prisma/client';
import { CreditService } from '../credits/credit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiCredentialsService } from './ai-credentials.service';
import { AiGalleryStorageService } from './ai-gallery.storage';
import { AiOperationsCatalogService } from './ai-operations.catalog';
import { AiOperationsExecuteService } from './ai-operations.execute.service';
import { ImageProviderRegistry } from './providers/image-provider.registry';

describe('AiOperationsExecuteService BYOK', () => {
  const userId = 'user-1';
  const credentialId = '550e8400-e29b-41d4-a716-446655440001';

  const credits = {
    reserveCredits: jest.fn(),
    captureReservation: jest.fn(),
    releaseReservation: jest.fn(),
  };
  const credentials = {
    resolveForRequest: jest.fn(),
    markUsed: jest.fn().mockResolvedValue(undefined),
  };
  const catalog = { resolveVariant: jest.fn() };
  const adapterExecute = jest.fn();
  const providers = { get: jest.fn() };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'AI_CREDIT_CHARGING_ENABLED' ? 'true' : fallback,
    ),
  };
  const prisma = {
    aiRequest: {
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const galleryStorage = {
    persistCompletedAssets: jest.fn().mockResolvedValue({}),
  };

  let service: AiOperationsExecuteService;

  beforeEach(() => {
    jest.clearAllMocks();
    credits.reserveCredits.mockResolvedValue({ id: 'res-1' });
    credentials.resolveForRequest.mockResolvedValue({
      credential: { id: credentialId, provider: 'openai' },
      apiKey: 'user-sk-test',
    });
    prisma.aiRequest.create.mockResolvedValue({ id: 'req-1' });
    adapterExecute.mockResolvedValue({ imageUrl: 'https://img/x.png' });
    providers.get.mockReturnValue({ execute: adapterExecute });
    galleryStorage.persistCompletedAssets.mockResolvedValue({});

    service = new AiOperationsExecuteService(
      catalog as unknown as AiOperationsCatalogService,
      providers as unknown as ImageProviderRegistry,
      credits as unknown as CreditService,
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      credentials as unknown as AiCredentialsService,
      galleryStorage as unknown as AiGalleryStorageService,
    );
  });

  it('accepts credentialId for replicate variants and skips credits', async () => {
    catalog.resolveVariant.mockResolvedValue({
      id: 'variant-rep',
      provider: 'replicate',
      externalModel: 'm',
      creditCost: 5,
    });
    credentials.resolveForRequest.mockResolvedValue({
      credential: { id: credentialId, provider: 'replicate' },
      apiKey: 'r8_user_token',
    });

    const result = await service.execute(
      userId,
      'generate-image',
      'variant-rep',
      { prompt: 'x' },
      credentialId,
    );

    expect(credentials.resolveForRequest).toHaveBeenCalledWith(
      userId,
      credentialId,
      'replicate',
    );
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(adapterExecute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'variant-rep' }),
      { prompt: 'x' },
      { apiKey: 'r8_user_token' },
    );
    expect(result.creditCost).toBe('0');
  });

  it('skips credit reserve for openai + credentialId', async () => {
    catalog.resolveVariant.mockResolvedValue({
      id: 'variant-oai',
      provider: 'openai',
      externalModel: 'gpt-image-1',
      creditCost: 5,
    });

    const result = await service.execute(
      userId,
      'generate-image',
      'variant-oai',
      { prompt: 'a cat' },
      credentialId,
    );

    expect(credentials.resolveForRequest).toHaveBeenCalledWith(
      userId,
      credentialId,
      'openai',
    );
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(credits.captureReservation).not.toHaveBeenCalled();
    expect(adapterExecute).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'variant-oai' }),
      { prompt: 'a cat' },
      { apiKey: 'user-sk-test' },
    );
    expect(prisma.aiRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billingMode: AiBillingMode.USER_KEY,
          credentialId,
          estimatedCreditCost: 0,
          creditReservationId: undefined,
        }),
      }),
    );
    expect(credentials.markUsed).toHaveBeenCalledWith(credentialId);
    expect(galleryStorage.persistCompletedAssets).toHaveBeenCalled();
    expect(result.imageUrl).toBe('https://img/x.png');
    expect(result.creditCost).toBe('0');
  });

  it('persists gallery keys into request JSON when storage succeeds', async () => {
    catalog.resolveVariant.mockResolvedValue({
      id: 'variant-oai',
      provider: 'openai',
      externalModel: 'gpt-image-1',
      creditCost: 5,
    });
    galleryStorage.persistCompletedAssets.mockResolvedValue({
      input: {
        storageKey: 'ai-gallery/user-1/req-1/in.jpg',
        contentType: 'image/jpeg',
        signedUrl: 'signed://in',
      },
      output: {
        storageKey: 'ai-gallery/user-1/req-1/out.png',
        contentType: 'image/png',
        signedUrl: 'signed://out',
      },
    });

    const result = await service.execute(
      userId,
      'generate-image',
      'variant-oai',
      {
        prompt: 'a cat',
        image: {
          buffer: Buffer.from([1]),
          mimetype: 'image/jpeg',
        } as Express.Multer.File,
      },
      credentialId,
    );

    expect(result.imageUrl).toBe('signed://out');
    expect(prisma.aiRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputJson: expect.objectContaining({
            inputStorageKey: 'ai-gallery/user-1/req-1/in.jpg',
          }),
          outputJson: expect.objectContaining({
            storageKey: 'ai-gallery/user-1/req-1/out.png',
            imageUrl: 'signed://out',
          }),
        }),
      }),
    );
  });

  it('keeps provider URL when gallery persist returns empty', async () => {
    catalog.resolveVariant.mockResolvedValue({
      id: 'variant-oai',
      provider: 'openai',
      externalModel: 'gpt-image-1',
      creditCost: 5,
    });
    galleryStorage.persistCompletedAssets.mockResolvedValue({});

    const result = await service.execute(
      userId,
      'generate-image',
      'variant-oai',
      { prompt: 'a cat' },
      credentialId,
    );

    expect(result.imageUrl).toBe('https://img/x.png');
    expect(prisma.aiRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outputJson: { imageUrl: 'https://img/x.png' },
        }),
      }),
    );
  });

  it('marks credential with error when adapter fails', async () => {
    catalog.resolveVariant.mockResolvedValue({
      id: 'variant-oai',
      provider: 'openai',
      externalModel: 'gpt-image-1',
      creditCost: 5,
    });
    adapterExecute.mockRejectedValue(
      new BadGatewayException({
        message: 'Incorrect API key provided: sk-secret123456',
        providerStatus: 401,
      }),
    );

    await expect(
      service.execute(
        userId,
        'generate-image',
        'variant-oai',
        { prompt: 'x' },
        credentialId,
      ),
    ).rejects.toThrow();
    expect(credentials.markUsed).toHaveBeenCalledWith(
      credentialId,
      expect.not.stringContaining('sk-secret123456'),
    );
    expect(credentials.markUsed).toHaveBeenCalledWith(
      credentialId,
      expect.stringContaining('sk-[REDACTED]'),
    );
    expect(prisma.aiRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorMessage: expect.not.stringContaining('sk-secret123456'),
        }),
      }),
    );
    expect(credits.releaseReservation).not.toHaveBeenCalled();
    expect(galleryStorage.persistCompletedAssets).not.toHaveBeenCalled();
  });

  it('does not invalidate credential on non-auth provider failure', async () => {
    catalog.resolveVariant.mockResolvedValue({
      id: 'variant-oai',
      provider: 'openai',
      externalModel: 'gpt-image-1',
      creditCost: 5,
    });
    adapterExecute.mockRejectedValue(
      new BadGatewayException({ message: 'Rate limited', providerStatus: 429 }),
    );

    await expect(
      service.execute(
        userId,
        'generate-image',
        'variant-oai',
        { prompt: 'x' },
        credentialId,
      ),
    ).rejects.toThrow('Rate limited');
    expect(credentials.markUsed).toHaveBeenCalledTimes(1);
    expect(credentials.markUsed).toHaveBeenCalledWith(credentialId);
    expect(credentials.markUsed).not.toHaveBeenCalledWith(
      credentialId,
      expect.anything(),
    );
  });

  it('rejects empty prompt for openai before reserve/create', async () => {
    catalog.resolveVariant.mockResolvedValue({
      id: 'variant-oai',
      provider: 'openai',
      externalModel: 'gpt-image-1',
      creditCost: 5,
    });

    await expect(
      service.execute(
        userId,
        'generate-image',
        'variant-oai',
        { prompt: '   ' },
        credentialId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(credentials.resolveForRequest).not.toHaveBeenCalled();
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(prisma.aiRequest.create).not.toHaveBeenCalled();
    expect(credentials.markUsed).not.toHaveBeenCalled();
  });

  it('executeCustom runs BYOK without a catalog type', async () => {
    credentials.resolveForRequest.mockResolvedValue({
      credential: { id: credentialId, provider: 'openai' },
      apiKey: 'user-sk-test',
    });

    const result = await service.executeCustom(userId, {
      credentialId,
      provider: 'openai',
      model: 'gpt-image-1',
      mode: 'generations',
      prompt: 'a cat',
    });

    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(adapterExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        externalModel: 'gpt-image-1',
      }),
      { prompt: 'a cat', image: undefined },
      { apiKey: 'user-sk-test' },
    );
    expect(prisma.aiRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          model: 'gpt-image-1',
          variantId: undefined,
          billingMode: AiBillingMode.USER_KEY,
        }),
      }),
    );
    expect(result.type).toBe('custom-byok');
    expect(result.creditCost).toBe('0');
  });

  it('executeCustom supports google Gemini image BYOK', async () => {
    credentials.resolveForRequest.mockResolvedValue({
      credential: { id: credentialId, provider: 'google' },
      apiKey: 'user-google-key',
    });

    const result = await service.executeCustom(userId, {
      credentialId,
      provider: 'google',
      model: 'gemini-2.5-flash-image',
      mode: 'generations',
      prompt: 'a nano banana',
    });

    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(adapterExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        externalModel: 'gemini-2.5-flash-image',
      }),
      { prompt: 'a nano banana', image: undefined },
      { apiKey: 'user-google-key' },
    );
    expect(result.type).toBe('custom-byok');
  });

  it('rejects openai edits without an image before reserve/create', async () => {
    catalog.resolveVariant.mockResolvedValue({
      id: 'variant-edit',
      provider: 'openai',
      externalModel: 'gpt-image-1',
      creditCost: 5,
      configJson: { mode: 'edits' },
    });

    await expect(
      service.execute(
        userId,
        'edit-image',
        'variant-edit',
        { prompt: 'make blue' },
        credentialId,
      ),
    ).rejects.toMatchObject({ response: { code: 'IMAGE_REQUIRED' } });
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(prisma.aiRequest.create).not.toHaveBeenCalled();
  });
});
