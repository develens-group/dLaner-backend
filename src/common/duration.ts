export function durationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * factors[match[2] as keyof typeof factors];
}
