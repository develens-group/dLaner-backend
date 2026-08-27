import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiExecutionResult } from '../ai/ai-provider';
import { CreateAiRequestDto } from '../ai/ai.dto';

@Injectable()
export class CreditCostCalculator {
  constructor(private readonly config: ConfigService) {}
  estimate(request: CreateAiRequestDto) {
    const fixed = this.config.get<number>('AI_CREDIT_FIXED_COST', 1);
    const unitBytes = this.config.get<number>(
      'AI_CREDIT_INPUT_UNIT_BYTES',
      4096,
    );
    const perUnit = this.config.get<number>('AI_CREDIT_INPUT_UNIT_COST', 1);
    const bytes = Buffer.byteLength(JSON.stringify(request.input));
    return Math.max(1, fixed + Math.ceil(bytes / unitBytes) * perUnit);
  }
  actual(request: CreateAiRequestDto, result: AiExecutionResult) {
    if (this.config.get('AI_CREDIT_TOKEN_PRICING_ENABLED', 'false') === 'true') {
      const fixed = this.config.get<number>('AI_CREDIT_FIXED_COST', 1);
      const inputRate = this.config.get<number>(
        'AI_CREDIT_PER_1K_INPUT_TOKENS',
        1,
      );
      const outputRate = this.config.get<number>(
        'AI_CREDIT_PER_1K_OUTPUT_TOKENS',
        2,
      );
      const promptTokens = result.usage?.promptTokens ?? 0;
      const completionTokens = result.usage?.completionTokens ?? 0;
      const tokenCost =
        Math.ceil(promptTokens / 1000) * inputRate +
        Math.ceil(completionTokens / 1000) * outputRate;
      return Math.max(1, fixed + tokenCost);
    }
    const estimate = this.estimate(request);
    const outputUnitBytes = this.config.get<number>(
      'AI_CREDIT_OUTPUT_UNIT_BYTES',
      4096,
    );
    const outputUnitCost = this.config.get<number>(
      'AI_CREDIT_OUTPUT_UNIT_COST',
      0,
    );
    const outputBytes = Buffer.byteLength(JSON.stringify(result.output));
    return Math.max(
      1,
      estimate + Math.ceil(outputBytes / outputUnitBytes) * outputUnitCost,
    );
  }
}
