import { AiOperation } from '@prisma/client';
import { AiProviderError } from '../ai-provider';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function resolveChatMessages(
  operation: AiOperation,
  input: Record<string, unknown>,
): ChatMessage[] {
  const messages = normalizeMessages(input.messages);
  if (messages.length) return messages;

  if (typeof input.prompt === 'string' && input.prompt.trim()) {
    const result: ChatMessage[] = [];
    if (typeof input.system === 'string' && input.system.trim())
      result.push({ role: 'system', content: input.system.trim() });
    result.push({ role: 'user', content: input.prompt.trim() });
    return result;
  }

  throw new AiProviderError(
    'INVALID_INPUT',
    operation === AiOperation.CHAT
      ? 'Provide input.messages or input.prompt'
      : 'Provide input.prompt or input.messages',
  );
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if (
        (role !== 'system' && role !== 'user' && role !== 'assistant') ||
        typeof content !== 'string' ||
        !content.trim()
      )
        return null;
      return { role, content: content.trim() } satisfies ChatMessage;
    })
    .filter((item): item is ChatMessage => item !== null);
}

export function maxOutputTokens(input: Record<string, unknown>, fallback = 1024) {
  const value = input.maxTokens ?? input.max_tokens;
  return typeof value === 'number' && value > 0 ? Math.min(value, 8192) : fallback;
}
