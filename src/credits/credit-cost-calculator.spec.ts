import { ConfigService } from '@nestjs/config';
import { AiOperation } from '@prisma/client';
import { CreditCostCalculator } from './credit-cost-calculator';

describe('CreditCostCalculator', () => {
  it('uses deterministic integer ceiling for input units', () => {
    const calculator = new CreditCostCalculator(
      new ConfigService({
        AI_CREDIT_FIXED_COST: 2,
        AI_CREDIT_INPUT_UNIT_BYTES: 10,
        AI_CREDIT_INPUT_UNIT_COST: 3,
        AI_CREDIT_OUTPUT_UNIT_BYTES: 10,
        AI_CREDIT_OUTPUT_UNIT_COST: 0,
      }),
    );
    const cost = calculator.estimate({
      provider: 'mock',
      model: 'mock',
      operation: AiOperation.CHAT,
      input: { prompt: '1234567890' },
    });
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBeGreaterThanOrEqual(5);
  });
});
