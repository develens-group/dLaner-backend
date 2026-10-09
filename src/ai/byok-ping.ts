import { AiProviderError } from './ai-provider';
import { providerFetch } from './providers/provider-http';

/** Lightweight live check that the user key is accepted by the provider. */
export async function pingByokCredential(provider: string, apiKey: string) {
  const key = apiKey.trim();
  switch (provider.toLowerCase()) {
    case 'google':
      await providerFetch(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          method: 'GET',
          headers: { 'x-goog-api-key': key },
        },
        'google',
      );
      return;
    case 'openai':
      await providerFetch(
        'https://api.openai.com/v1/models',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        },
        'openai',
      );
      return;
    case 'anthropic':
      await providerFetch(
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
      return;
    default:
      throw new AiProviderError(
        'UNSUPPORTED_PROVIDER',
        `Provider "${provider}" does not support connection tests`,
      );
  }
}
