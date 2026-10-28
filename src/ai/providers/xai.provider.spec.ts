import { ConfigService } from '@nestjs/config';
import { AiOperation } from '@prisma/client';
import { XaiProvider } from './xai.provider';

describe('XaiProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is configured only when XAI_API_KEY is present', () => {
    const empty = { get: () => undefined } as unknown as ConfigService;
    const filled = { get: () => 'xai-platform' } as unknown as ConfigService;
    expect(new XaiProvider(empty).isConfigured()).toBe(false);
    expect(new XaiProvider(filled).isConfigured()).toBe(true);
  });

  it('calls the OpenAI-compatible xAI chat endpoint', async () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'chat-1',
          choices: [{ message: { content: ' Hello from Grok ' } }],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        }),
    } as Response);

    const provider = new XaiProvider(config);
    const result = await provider.execute({
      model: 'grok-4',
      operation: AiOperation.CHAT,
      input: { messages: [{ role: 'user', content: 'hi' }] },
      apiKey: 'xai-user',
    });

    expect(result.output).toEqual({ text: 'Hello from Grok' });
    expect(result.providerRequestId).toBe('chat-1');
    expect(result.usage?.totalTokens).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.x.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer xai-user',
          'Content-Type': 'application/json',
        },
        body: expect.any(String) as string,
      },
    );
  });

  it('throws when neither a user key nor a platform key exists', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    await expect(
      new XaiProvider(config).execute({
        model: 'grok-4',
        operation: AiOperation.CHAT,
        input: { prompt: 'hi' },
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });
});
