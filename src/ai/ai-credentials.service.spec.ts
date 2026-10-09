import { AiCredentialsService } from './ai-credentials.service';
import { encryptSecret, keyHint } from './credential-crypto';

describe('AiCredentialsService.testConnection', () => {
  const hexKey = 'a'.repeat(64);
  const apiKey = 'sk-test-user-key-123456';

  it('returns ok after decrypt without calling external providers', async () => {
    const enc = encryptSecret(apiKey, hexKey);
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
        update: jest.fn(),
      },
    };
    const config = { get: jest.fn().mockReturnValue(hexKey) };
    const service = new AiCredentialsService(prisma as any, config as any);

    const result = await service.testConnection('user-1', 'cred-1');

    expect(result).toEqual({
      ok: true,
      mode: 'resolve',
      provider: 'openai',
      keyHint: keyHint(apiKey),
    });
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(JSON.stringify(result)).not.toContain(enc);
    expect(prisma.userAiCredential.update).not.toHaveBeenCalled();
  });

  it('reactivates INVALID credentials after a successful decrypt test', async () => {
    const enc = encryptSecret(apiKey, hexKey);
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
});
