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
      expect.arrayContaining(['gpt-4o-mini', 'o1-mini', 'gpt-image-1', 'dall-e-3']),
    );
    expect(ids).not.toContain('text-embedding-3-small');
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
