import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AiExecutionRequest,
  AiExecutionResult,
  AiProvider,
  AiProviderError,
} from './ai-provider';
@Injectable()
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  execute(request: AiExecutionRequest): Promise<AiExecutionResult> {
    if (request.input.simulateFailure === true)
      return Promise.reject(
        new AiProviderError(
          'MOCK_FAILURE',
          'The mock provider rejected the request',
        ),
      );
    const text =
      typeof request.input.prompt === 'string'
        ? request.input.prompt
        : JSON.stringify(request.input);
    const promptTokens = Math.ceil(text.length / 4);
    return Promise.resolve({
      output: { text: `Mock response: ${text.slice(0, 500)}` },
      providerRequestId: `mock_${randomUUID()}`,
      usage: {
        promptTokens,
        completionTokens: 10,
        totalTokens: promptTokens + 10,
      },
    });
  }
}
