import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiImageProvider } from './openai-image.provider';

/**
 * xAI image generation is OpenAI-compatible
 * (`POST https://api.x.ai/v1/images/generations`).
 * The public xAI API does not expose image edits yet, so `edits` is rejected.
 */
@Injectable()
export class XaiImageProvider extends OpenAiImageProvider {
  readonly id: string = 'xai';
  protected readonly label: string = 'xAI';
  protected readonly baseUrl: string = 'https://api.x.ai/v1';
  protected readonly envKey: string = 'XAI_API_KEY';
  protected readonly supportsEdits: boolean = false;

  constructor(config: ConfigService) {
    super(config);
  }
}
