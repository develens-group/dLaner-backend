import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parseCreditAmount } from '../credits/credit-units';

export const REPLICATE_PRESETS = [
  {
    id: 'nano-banana-2-1',
    slug: 'generate-nano-banana-2-1',
    label: 'Nano Banana 2.1',
    model: 'google/nano-banana-2.1',
    parameter: 'resolution',
    options: ['1K', '2K', '4K'],
    description: 'Generate or edit images with Google Nano Banana 2.1.',
  },
  {
    id: 'gpt-image-2-5-flare',
    slug: 'generate-gpt-image-2-5-flare',
    label: 'GPT Image 2.5 Flare',
    model: 'openai/gpt-image-2.5-flare',
    parameter: 'quality',
    options: ['low', 'medium', 'high', 'xhigh', 'max', 'auto'],
    description: 'Fast image generation and editing with GPT Image 2.5 Flare.',
  },
  {
    id: 'gpt-image-2-5-sunburst',
    slug: 'generate-gpt-image-2-5-sunburst',
    label: 'GPT Image 2.5 Sunburst',
    model: 'openai/gpt-image-2.5-sunburst',
    parameter: 'quality',
    options: ['low', 'medium', 'high', 'xhigh', 'max', 'auto'],
    description:
      'Detailed image generation and editing with GPT Image 2.5 Sunburst.',
  },
] as const;

export function pricedPreset(id: string, prices: Record<string, unknown>) {
  const preset = REPLICATE_PRESETS.find((item) => item.id === id);
  if (
    !preset ||
    !prices ||
    Array.isArray(prices) ||
    typeof prices !== 'object'
  ) {
    throw new BadRequestException('Unknown model preset or invalid prices');
  }
  if (
    Object.keys(prices).some(
      (key) => !(preset.options as readonly string[]).includes(key),
    )
  ) {
    throw new BadRequestException('Unsupported quality or resolution');
  }
  const entries = preset.options
    .filter((value) => prices[value] !== undefined)
    .map((value) => {
      try {
        const cost = parseCreditAmount(prices[value]);
        if (!cost.isFinite() || cost.lte(0)) {
          throw new Error('positive price required');
        }
        const hash = createHash('sha256')
          .update(`replicate-preset:${id}:${value}`)
          .digest('hex')
          .slice(0, 32);
        const variantId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
        return { value, cost, variantId };
      } catch {
        throw new BadRequestException(
          `Set a positive decimal credit price for ${value}`,
        );
      }
    });
  if (!entries.length) {
    throw new BadRequestException('Price at least one quality or resolution');
  }
  return { preset, entries };
}

export function inputSelection(config: unknown) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }
  const selection = (config as Record<string, unknown>).selection;
  if (!selection || typeof selection !== 'object') {
    return undefined;
  }
  const { name, value } = selection as Record<string, unknown>;
  return (name === 'quality' || name === 'resolution') &&
    typeof value === 'string'
    ? { name, value }
    : undefined;
}
