import { ConfigService } from '@nestjs/config';
import { OpenAiImageProvider } from './openai-image.provider';

describe('OpenAiImageProvider', () => {
  const config = {
    get: jest.fn().mockReturnValue('sk-platform'),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses generations for prompt-only requests', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ url: 'https://img/out.png' }] }),
    } as Response);

    const provider = new OpenAiImageProvider(config);
    const result = await provider.execute(
      {
        externalModel: 'gpt-image-1',
        configJson: { mode: 'generations' },
      } as never,
      { prompt: 'a cat' },
      { apiKey: 'sk-user' },
    );

    expect(result.imageUrl).toBe('https://img/out.png');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-user',
        }),
      }),
    );
  });

  it('uses edits when mode is edits and image is present', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: Buffer.from([1, 2]).toString('base64') }],
      }),
    } as Response);

    const provider = new OpenAiImageProvider(config);
    const result = await provider.execute(
      {
        externalModel: 'gpt-image-1',
        configJson: { mode: 'edits' },
      } as never,
      {
        prompt: 'make blue',
        image: {
          buffer: Buffer.from([9, 8]),
          mimetype: 'image/png',
          originalname: 'in.png',
        } as Express.Multer.File,
      },
      { apiKey: 'sk-user' },
    );

    expect(result.imageUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer sk-user' },
      }),
    );
  });

  it('rejects edits without an image', async () => {
    const provider = new OpenAiImageProvider(config);
    await expect(
      provider.execute(
        {
          externalModel: 'gpt-image-1',
          configJson: { mode: 'edits' },
        } as never,
        { prompt: 'x' },
      ),
    ).rejects.toMatchObject({ response: { code: 'IMAGE_REQUIRED' } });
  });
});
