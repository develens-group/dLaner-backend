import { AiOperation } from '@prisma/client';
import { resolveChatMessages } from './ai-input.utils';

describe('resolveChatMessages', () => {
  it('uses messages when provided', () => {
    expect(
      resolveChatMessages(AiOperation.CHAT, {
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('builds messages from prompt and system', () => {
    expect(
      resolveChatMessages(AiOperation.TEXT_GENERATION, {
        prompt: 'Write copy',
        system: 'You are helpful',
      }),
    ).toEqual([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Write copy' },
    ]);
  });

  it('throws when input is missing', () => {
    expect(() => resolveChatMessages(AiOperation.CHAT, {})).toThrow(
      'Provide input.messages or input.prompt',
    );
  });
});
