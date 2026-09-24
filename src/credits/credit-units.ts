/**
 * Platform credits use millicredit integers in storage (×1000).
 * API surfaces three decimal places (e.g. 0.002 → 2 milli).
 */
export const CREDIT_MILLI_SCALE = 1000;
const MAX_FRACTION_DIGITS = 3;

export function toMilli(decimalCredits: number): number {
  if (!Number.isFinite(decimalCredits))
    throw new Error('Credit amount must be a finite number');
  if (decimalCredits < 0) throw new Error('Credit amount must be >= 0');
  const scaled = decimalCredits * CREDIT_MILLI_SCALE;
  const rounded = Math.round(scaled);
  // Reject values that need more than 3 decimal places (beyond float noise)
  if (Math.abs(scaled - rounded) > 1e-6)
    throw new Error('Credit amount supports at most 3 decimal places');
  return rounded;
}

export function fromMilli(milli: number): number {
  if (!Number.isFinite(milli) || !Number.isInteger(milli))
    throw new Error('Millicredit amount must be an integer');
  return milli / CREDIT_MILLI_SCALE;
}

/** Format for JSON responses: always 3 fraction digits as number. */
export function fromMilliDisplay(milli: number): number {
  return Number(fromMilli(milli).toFixed(MAX_FRACTION_DIGITS));
}

/**
 * Parse API input (number or string) into millicredits.
 * Rejects >3 decimal places in the string form.
 */
export function parseCreditsToMilli(value: unknown): number {
  if (typeof value === 'number') return toMilli(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+(\.\d{1,3})?$/.test(trimmed))
      throw new Error(
        'Credit amount must be a non-negative number with at most 3 decimal places',
      );
    return toMilli(Number(trimmed));
  }
  throw new Error('Credit amount must be a number or decimal string');
}
