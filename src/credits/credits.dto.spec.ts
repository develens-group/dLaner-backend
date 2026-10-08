import { ValidationPipe } from '@nestjs/common';
import { AdjustmentDto, CreditPackageDto, RefundDto } from './credits.dto';

describe('credit amount DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('accepts a decimal-string amount through the global validation pipe', async () => {
    await expect(
      pipe.transform(
        {
          amount: '100',
          idempotencyKey: 'task6-smoke-grant',
          reason: 'AI execute smoke test',
        },
        { type: 'body', metatype: AdjustmentDto },
      ),
    ).resolves.toMatchObject({ amount: '100' });
  });

  it('rejects an invalid refund amount', async () => {
    await expect(
      pipe.transform(
        {
          amount: '-1',
          idempotencyKey: 'refund-request-0001',
          reason: 'Customer refund request',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
        },
        { type: 'body', metatype: RefundDto },
      ),
    ).rejects.toThrow();
  });

  it.each(['creditAmount', 'bonusCreditAmount'])(
    'rejects an invalid package %s',
    async (field) => {
      await expect(
        pipe.transform(
          {
            name: 'Starter Pack',
            creditAmount: '1.5',
            bonusCreditAmount: '0.1',
            priceMinor: 9900,
            currency: 'USD',
            [field]: '0.1234567890123456789',
          },
          { type: 'body', metatype: CreditPackageDto },
        ),
      ).rejects.toThrow();
    },
  );
});
