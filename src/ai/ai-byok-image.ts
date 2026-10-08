export const BYOK_IMAGE_PROVIDERS = new Set<string>(['openai']);

export const isByokImageProvider = (provider: string) =>
  BYOK_IMAGE_PROVIDERS.has(provider.toLowerCase());
