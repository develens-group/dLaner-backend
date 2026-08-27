import { AiProviderError } from '../ai-provider';

export async function providerFetch<T>(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new AiProviderError(
      'PROVIDER_UNAVAILABLE',
      `${provider} API is unreachable`,
    );
  }
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message = extractProviderError(body) ?? `${provider} request failed`;
    throw new AiProviderError(
      response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_HTTP_ERROR',
      message,
    );
  }
  return body as T;
}

function extractProviderError(body: Record<string, unknown>) {
  const error = body.error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  if (typeof body.message === 'string') return body.message;
  return undefined;
}
