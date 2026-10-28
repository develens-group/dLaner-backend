import { listByokModels } from './byok-ping';

describe('listByokModels', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps openai chat models and filters non-chat ids', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o-mini' },
          { id: 'text-embedding-3-small' },
          { id: 'dall-e-3' },
          { id: 'o1-mini' },
        ],
      }),
    } as Response);

    const models = await listByokModels('openai', 'sk-test-key-12345678');
    const ids = models.map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'gpt-4o-mini',
        'o1-mini',
        'gpt-image-1',
        'dall-e-3',
      ]),
    );
    expect(ids).not.toContain('text-embedding-3-small');
  });

  it('lists xAI grok models from the OpenAI-compatible endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'grok-4' },
          { id: 'grok-2-image' },
          { id: 'grok-embedding-1' },
        ],
      }),
    } as Response);

    const models = await listByokModels('xai', 'xai-test-key-12345678');
    expect(models).toEqual([
      { id: 'grok-2-image', label: 'grok-2-image' },
      { id: 'grok-4', label: 'grok-4' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.x.ai/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer xai-test-key-12345678' },
      }),
    );
  });

  it('strips models/ prefix for google', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
          { name: 'models/embedding-001', displayName: 'Embedding' },
        ],
      }),
    } as Response);

    const models = await listByokModels('google', 'AIza-test-key-123456');
    expect(models).toEqual([
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    ]);
  });
});
