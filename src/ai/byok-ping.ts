import { AiProviderError } from './ai-provider';
import { providerFetch } from './providers/provider-http';

export type ByokModelInfo = { id: string; label?: string };

/** Lightweight live check that the user key is accepted by the provider. */
export async function pingByokCredential(provider: string, apiKey: string) {
  await listByokModels(provider, apiKey);
}

/** List models available to this user API key (never returns the secret). */
export async function listByokModels(
  provider: string,
  apiKey: string,
): Promise<ByokModelInfo[]> {
  const key = apiKey.trim();
  switch (provider.toLowerCase()) {
    case 'google': {
      const body = await providerFetch<{
        models?: Array<{ name?: string; displayName?: string }>;
      }>(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          method: 'GET',
          headers: { 'x-goog-api-key': key },
        },
        'google',
      );
      return (body.models ?? [])
        .map((item) => {
          const raw = item.name?.trim() ?? '';
          const id = raw.replace(/^models\//, '');
          if (!id) return null;
          if (
            id.includes('embedding') ||
            id.includes('aqa') ||
            id.includes('gecko')
          )
            return null;
          return {
            id,
            label: item.displayName?.trim() || id,
          } satisfies ByokModelInfo;
        })
        .filter((item): item is ByokModelInfo => item !== null);
    }
    case 'openai': {
      const body = await providerFetch<{
        data?: Array<{ id?: string }>;
      }>(
        'https://api.openai.com/v1/models',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        },
        'openai',
      );
      const chat = (body.data ?? [])
        .map((item) => item.id?.trim())
        .filter((id): id is string => !!id)
        .filter(
          (id) =>
            /^(gpt-|o[0-9]|chatgpt-|ft:)/i.test(id) &&
            !/instruct|realtime|audio|tts|whisper|embedding|moderation|dall-e|image/i.test(
              id,
            ),
        );
      const imageDefaults = ['gpt-image-1', 'dall-e-3', 'dall-e-2'];
      const fromApi = (body.data ?? [])
        .map((item) => item.id?.trim())
        .filter((id): id is string => !!id)
        .filter((id) => /dall-e|gpt-image|imagen/i.test(id));
      const image = Array.from(new Set([...imageDefaults, ...fromApi]));
      return [...chat.sort(), ...image].map((id) => ({ id, label: id }));
    }
    case 'anthropic': {
      const body = await providerFetch<{
        data?: Array<{ id?: string; display_name?: string }>;
      }>(
        'https://api.anthropic.com/v1/models',
        {
          method: 'GET',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
        },
        'anthropic',
      );
      return (body.data ?? [])
        .map((item) => {
          const id = item.id?.trim();
          if (!id) return null;
          return {
            id,
            label: item.display_name?.trim() || id,
          } satisfies ByokModelInfo;
        })
        .filter((item): item is ByokModelInfo => item !== null);
    }
    case 'replicate':
      // Image BYOK only — validate the token; models come from the admin catalog.
      await providerFetch(
        'https://api.replicate.com/v1/account',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        },
        'replicate',
      );
      return [];
    default:
      throw new AiProviderError(
        'UNSUPPORTED_PROVIDER',
        `Provider "${provider}" does not support connection tests`,
      );
  }
}
