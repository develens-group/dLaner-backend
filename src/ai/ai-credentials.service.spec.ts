import { BadRequestException } from '@nestjs/common';
import { AiCredentialsService } from './ai-credentials.service';
import { encryptSecret, keyHint } from './credential-crypto';

describe('AiCredentialsService.testConnection', () => {
  const hexKey = 'a'.repeat(64);
  const apiKey = 'sk-test-user-key-123456';

  const mockFetchOk = () =>
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns ok after a live provider ping', async () => {
    const enc = encryptSecret(apiKey, hexKey);
    const fetchMock = mockFetchOk();
    const prisma = {
      userAiCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cred-1',
          userId: 'user-1',
          provider: 'openai',
          apiKeyEnc: enc,
          keyHint: keyHint(apiKey),
          status: 'ACTIVE',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const config = { get: jest.fn().mockReturnValue(hexKey) };
    const service = new AiCredentialsService(prisma as any, config as any);

    const result = await service.testConnection('user-1', 'cred-1');

    expect(result).toEqual({
      ok: true,
      mode: 'live',
      provider: 'openai',
      keyHint: keyHint(apiKey),
    });
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(JSON.stringify(result)).not.toContain(enc);
    expect(fetchMock).toHaveBeenCalled();
    expect(prisma.userAiCredential.update).toHaveBeenCalledWith({
      where: { id: 'cred-1' },
      data: {
        lastUsedAt: expect.any(Date),
        lastError: null,
        status: 'ACTIVE',
      },
    });
  });

  it('reactivates INVALID credentials after a successful live ping', async () => {
    const enc = encryptSecret(apiKey, hexKey);
    mockFetchOk();
    const prisma = {
      userAiCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cred-1',
          userId: 'user-1',
          provider: 'openai',
          apiKeyEnc: enc,
          keyHint: keyHint(apiKey),
          status: 'INVALID',
          lastError: 'previous failure',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const config = { get: jest.fn().mockReturnValue(hexKey) };
    const service = new AiCredentialsService(prisma as any, config as any);

    const result = await service.testConnection('user-1', 'cred-1');

    expect(result.ok).toBe(true);
    expect(prisma.userAiCredential.update).toHaveBeenCalledWith({
      where: { id: 'cred-1' },
      data: {
        lastUsedAt: expect.any(Date),
        lastError: null,
        status: 'ACTIVE',
      },
    });
  });

  it('rotates api key on update and clears INVALID status', async () => {
    const enc = encryptSecret(apiKey, hexKey);
    const prisma = {
      userAiCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cred-1',
          userId: 'user-1',
          provider: 'openai',
          apiKeyEnc: enc,
          status: 'INVALID',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'cred-1',
          provider: 'openai',
          status: 'ACTIVE',
          keyHint: keyHint('sk-rotated-user-key-999999'),
        }),
        updateMany: jest.fn(),
      },
    };
    const config = { get: jest.fn().mockReturnValue(hexKey) };
    const service = new AiCredentialsService(prisma as any, config as any);

    await service.update('user-1', 'cred-1', {
      apiKey: 'sk-rotated-user-key-999999',
    });

    expect(prisma.userAiCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          lastError: null,
          keyHint: keyHint('sk-rotated-user-key-999999'),
          apiKeyEnc: expect.any(String),
        }),
      }),
    );
    const storedEnc = prisma.userAiCredential.update.mock.calls[0][0].data
      .apiKeyEnc as string;
    expect(storedEnc).not.toContain('sk-rotated');
  });

  it('marks credential INVALID when the live ping fails', async () => {
    const enc = encryptSecret(apiKey, hexKey);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: 'Incorrect API key provided: sk-test-user-key-123456' },
      }),
    } as Response);
    const prisma = {
      userAiCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cred-1',
          userId: 'user-1',
          provider: 'openai',
          apiKeyEnc: enc,
          keyHint: keyHint(apiKey),
          status: 'ACTIVE',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const config = { get: jest.fn().mockReturnValue(hexKey) };
    const service = new AiCredentialsService(prisma as any, config as any);

    await expect(service.testConnection('user-1', 'cred-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.userAiCredential.update).toHaveBeenCalledWith({
      where: { id: 'cred-1' },
      data: {
        lastUsedAt: expect.any(Date),
        lastError: expect.stringContaining('Incorrect API key'),
        status: 'INVALID',
      },
    });
    const lastError =
      prisma.userAiCredential.update.mock.calls[0][0].data.lastError as string;
    expect(lastError).not.toContain(apiKey);
  });
});
