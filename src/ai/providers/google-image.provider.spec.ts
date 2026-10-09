import { ConfigService } from '@nestjs/config';
import { GoogleImageProvider } from './google-image.provider';

describe('GoogleImageProvider', () => {
  const config = {
    get: jest.fn().mockReturnValue('platform-google-key'),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls generateContent with TEXT+IMAGE modalities for generations', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: 'here you go' },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: Buffer.from([1, 2, 3]).toString('base64'),
                  },
                },
              ],
            },
          },
        ],
      }),
    } as Response);

    const provider = new GoogleImageProvider(config);
    const result = await provider.execute(
      {
        externalModel: 'gemini-2.5-flash-image',
        configJson: { mode: 'generations' },
      } as never,
      { prompt: 'a cat' },
      { apiKey: 'user-google-key' },
    );

    expect(result.imageUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'user-google-key',
        }),
      }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.generationConfig.responseModalities).toEqual([
      'TEXT',
      'IMAGE',
    ]);
    expect(body.contents[0].parts).toEqual([{ text: 'a cat' }]);
  });

  it('includes inline image data for edits', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: Buffer.from([9]).toString('base64'),
                  },
                },
              ],
            },
          },
        ],
      }),
    } as Response);

    const provider = new GoogleImageProvider(config);
    await provider.execute(
      {
        externalModel: 'models/gemini-2.5-flash-image',
        configJson: { mode: 'edits' },
      } as never,
      {
        prompt: 'make blue',
        image: {
          buffer: Buffer.from([7, 8]),
          mimetype: 'image/png',
          originalname: 'in.png',
        } as Express.Multer.File,
      },
      { apiKey: 'user-google-key' },
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.contents[0].parts).toEqual([
      { text: 'make blue' },
      {
        inlineData: {
          mimeType: 'image/png',
          data: Buffer.from([7, 8]).toString('base64'),
        },
      },
    ]);
  });

  it('rejects edits without an image', async () => {
    const provider = new GoogleImageProvider(config);
    await expect(
      provider.execute(
        {
          externalModel: 'gemini-2.5-flash-image',
          configJson: { mode: 'edits' },
        } as never,
        { prompt: 'make blue' },
      ),
    ).rejects.toMatchObject({ response: { code: 'IMAGE_REQUIRED' } });
  });
});
