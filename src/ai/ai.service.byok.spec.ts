import { ConfigService } from '@nestjs/config';
import {
  AiBillingMode,
  AiOperation,
  AiRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditCostCalculator } from '../credits/credit-cost-calculator';
import { CreditService } from '../credits/credit.service';
import { AiCredentialsService } from './ai-credentials.service';
import { AiProviderRegistry } from './ai-provider.registry';
import { AiService } from './ai.service';
import type { AiHistoryStore } from './ai-history.store';

describe('AiService BYOK', () => {
  const userId = 'user-1';
  const credentialId = '550e8400-e29b-41d4-a716-446655440001';

  const credits = {
    reserveCredits: jest.fn(),
    captureReservation: jest.fn(),
    releaseReservation: jest.fn(),
  };

  const costs = {
    estimate: jest.fn().mockReturnValue(5),
    actual: jest.fn().mockReturnValue(5),
  };

  const credentials = {
    resolveForRequest: jest.fn(),
    markUsed: jest.fn().mockResolvedValue(undefined),
  };

  const execute = jest.fn();

  const providers = {
    get: jest.fn(),
  };

  const history: AiHistoryStore = {
    create: jest.fn(),
    complete: jest.fn(),
    getMany: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'AI_CREDIT_CHARGING_ENABLED') return 'true';
      if (key === 'AI_HISTORY_STORAGE_DRIVER') return 'postgres';
      return fallback;
    }),
  };

  let prisma: {
    aiRequest: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  let service: AiService;

  beforeEach(() => {
    jest.clearAllMocks();

    credits.reserveCredits.mockResolvedValue({ id: 'res-1', amount: 5 });
    credentials.resolveForRequest.mockResolvedValue({
      credential: {
        id: credentialId,
        userId,
        provider: 'openai',
        status: 'ACTIVE',
      },
      apiKey: 'user-sk-test',
    });
    execute.mockResolvedValue({
      output: { text: 'ok' },
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    });
    providers.get.mockReturnValue({ execute });

    prisma = {
      aiRequest: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'req-1',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({
            id: where.id,
            userId,
            requestId: undefined,
            credentialId,
            billingMode: AiBillingMode.USER_KEY,
            provider: 'openai',
            model: 'gpt-4o-mini',
            operation: AiOperation.CHAT,
            status: AiRequestStatus.COMPLETED,
            inputJson: { prompt: 'hi' },
            inputHash: 'hash',
            inputOmitted: false,
            inputTruncated: false,
            inputRedacted: false,
            outputJson: { text: 'ok' },
            outputOmitted: false,
            outputTruncated: false,
            outputRedacted: false,
            providerRequestId: undefined,
            promptTokens: 3,
            completionTokens: 4,
            totalTokens: 7,
            estimatedCreditCost: 0,
            chargedCreditAmount: 0,
            latencyMs: 1,
            errorCode: null,
            errorMessage: null,
            startedAt: new Date(),
            completedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          }),
        ),
      },
    };

    service = new AiService(
      prisma as unknown as PrismaService,
      providers as unknown as AiProviderRegistry,
      config as unknown as ConfigService,
      credits as unknown as CreditService,
      costs as unknown as CreditCostCalculator,
      credentials as unknown as AiCredentialsService,
      history,
    );
  });

  it('does not reserve credits when credentialId is provided', async () => {
    await service.createAndExecute(
      userId,
      undefined,
      undefined,
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        operation: AiOperation.CHAT,
        input: { prompt: 'hi' },
        credentialId,
      },
    );

    expect(credentials.resolveForRequest).toHaveBeenCalledWith(
      userId,
      credentialId,
      'openai',
    );
    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(credits.captureReservation).not.toHaveBeenCalled();
    expect(costs.estimate).not.toHaveBeenCalled();
    expect(providers.get).toHaveBeenCalledWith('openai');
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'user-sk-test',
      }),
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
  });
});
