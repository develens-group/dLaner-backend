import { ConfigService } from '@nestjs/config';
import { XaiImageProvider } from './xai-image.provider';

describe('XaiImageProvider', () => {
  const config = {
    get: jest.fn().mockReturnValue('xai-platform'),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates images through the xAI endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ url: 'https://img/grok.png' }] }),
    } as Response);

    const provider = new XaiImageProvider(config);
    const result = await provider.execute(
      {
        externalModel: 'grok-2-image',
        configJson: { mode: 'generations' },
      } as never,
      { prompt: 'a cat' },
      { apiKey: 'xai-user' },
    );

    expect(result.imageUrl).toBe('https://img/grok.png');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.x.ai/v1/images/generations',
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

  it('rejects image edits because xAI does not support them', async () => {
    const provider = new XaiImageProvider(config);
    await expect(
      provider.execute(
        {
          externalModel: 'grok-2-image',
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
      ),
    ).rejects.toMatchObject({ response: { code: 'BYOK_NOT_SUPPORTED' } });
  });
});
