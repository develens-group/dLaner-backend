import {
  fromMilli,
  fromMilliDisplay,
  parseCreditsToMilli,
  toMilli,
} from './credit-units';

describe('credit-units', () => {
  it('converts 0.002 credits to 2 millicredits', () => {
    expect(toMilli(0.002)).toBe(2);
    expect(fromMilli(2)).toBe(0.002);
    expect(fromMilliDisplay(2)).toBe(0.002);
  });

  it('converts whole credits', () => {
    expect(toMilli(1)).toBe(1000);
    expect(fromMilliDisplay(1000)).toBe(1);
  });

  it('parses decimal strings', () => {
    expect(parseCreditsToMilli('0.003')).toBe(3);
    expect(parseCreditsToMilli('1.5')).toBe(1500);
  });

  it('rejects more than 3 decimal places in strings', () => {
    expect(() => parseCreditsToMilli('0.0001')).toThrow(/3 decimal/);
  });

  it('rejects negative amounts', () => {
    expect(() => toMilli(-1)).toThrow();
  });
});
