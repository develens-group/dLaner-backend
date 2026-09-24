import { Prisma } from '@prisma/client';
import {
  CREDIT_MAX_FRACTION_DIGITS,
  formatCreditAmount,
  parseCreditAmount,
} from './credit-units';

describe('credit-units', () => {
  it('parses long fractional credit strings', () => {
    const v = parseCreditAmount('0.000000123456789');
    expect(v instanceof Prisma.Decimal).toBe(true);
    expect(formatCreditAmount(v)).toBe('0.000000123456789');
  });

  it('parses ordinary decimals and whole credits', () => {
    expect(formatCreditAmount(parseCreditAmount(0.002))).toBe('0.002');
    expect(formatCreditAmount(parseCreditAmount('1.5'))).toBe('1.5');
    expect(formatCreditAmount(parseCreditAmount(1))).toBe('1');
  });

  it(`rejects more than ${CREDIT_MAX_FRACTION_DIGITS} decimal places`, () => {
    expect(() =>
      parseCreditAmount(`0.${'1'.repeat(CREDIT_MAX_FRACTION_DIGITS + 1)}`),
    ).toThrow(/decimal places/);
  });

  it('rejects negative amounts', () => {
    expect(() => parseCreditAmount(-1)).toThrow();
  });
});
