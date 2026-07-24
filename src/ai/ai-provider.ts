import { AiOperation } from '@prisma/client';
export interface AiExecutionRequest {
  model: string;
  operation: AiOperation;
  input: Record<string, unknown>;
}
export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
export interface AiExecutionResult {
  output: unknown;
  providerRequestId?: string;
  usage?: AiUsage;
}
export interface AiProvider {
  readonly name: string;
  execute(request: AiExecutionRequest): Promise<AiExecutionResult>;
  cancel?(providerRequestId: string): Promise<boolean>;
}
export class AiProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
