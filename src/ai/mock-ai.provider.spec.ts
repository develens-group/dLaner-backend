import { AiOperation } from '@prisma/client';
import { AiProviderError } from './ai-provider';
import { MockAiProvider } from './mock-ai.provider';

describe('MockAiProvider', () => {
  const provider = new MockAiProvider();
  it('returns output and usage', async () => {
    const result = await provider.execute({
      model: 'mock-1',
      operation: AiOperation.CHAT,
      input: { prompt: 'hello' },
    });
    expect(result.output).toEqual({ text: 'Mock response: hello' });
    expect(result.usage?.totalTokens).toBeGreaterThan(0);
  });
  it('normalizes its simulated failure', async () => {
    await expect(
      provider.execute({
        model: 'mock-1',
        operation: AiOperation.CHAT,
        input: { simulateFailure: true },
      }),
    ).rejects.toBeInstanceOf(AiProviderError);
  });
});
