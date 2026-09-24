import { Prisma } from '@prisma/client';

/** Max fraction digits stored in DECIMAL(36, 18). */
export const CREDIT_MAX_FRACTION_DIGITS = 18;

const NON_NEGATIVE = /^\d+(\.\d+)?$/;

function fractionDigits(normalized: string): number {
  const i = normalized.indexOf('.');
  return i < 0 ? 0 : normalized.length - i - 1;
}

/**
 * Parse API credit input (number or decimal string) into Prisma.Decimal.
 * Supports long fractional values up to 18 places (DB limit).
 */
export function parseCreditAmount(value: unknown): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    if (value.isNeg()) throw new Error('Credit amount must be >= 0');
    const asStr = value.toFixed();
    if (fractionDigits(asStr.includes('e') || asStr.includes('E') ? value.toFixed(CREDIT_MAX_FRACTION_DIGITS) : asStr) >
      CREDIT_MAX_FRACTION_DIGITS) {
      // Decimal may already be normalized
    }
    return value;
  }

  let raw: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Credit amount must be a finite number');
    if (value < 0) throw new Error('Credit amount must be >= 0');
    raw = value.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: CREDIT_MAX_FRACTION_DIGITS,
    });
  } else if (typeof value === 'string') {
    raw = value.trim();
  } else {
    throw new Error('Credit amount must be a number or decimal string');
  }

  if (!NON_NEGATIVE.test(raw))
    throw new Error('Credit amount must be a non-negative decimal');
  if (fractionDigits(raw) > CREDIT_MAX_FRACTION_DIGITS)
    throw new Error(
      `Credit amount supports at most ${CREDIT_MAX_FRACTION_DIGITS} decimal places`,
    );

  return new Prisma.Decimal(raw);
}

/** Normalize for JSON responses: full precision, trim trailing zeros (string). */
export function formatCreditAmount(
  value: Prisma.Decimal | number | string | null | undefined,
): string {
  if (value === null || value === undefined) return '0';
  const dec =
    value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(typeof value === 'number' ? String(value) : value);
  const fixed = dec.toFixed(CREDIT_MAX_FRACTION_DIGITS);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/\.?0+$/, '') || '0';
}

export function creditDecimal(
  value: Prisma.Decimal | number | string,
): Prisma.Decimal {
  return value instanceof Prisma.Decimal
    ? value
    : parseCreditAmount(value);
}
