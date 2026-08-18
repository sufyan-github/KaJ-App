const TTL_PATTERN = /^(\d+)(s|m|h|d)$/;

const multiplierByUnit = {
  d: 86_400,
  h: 3_600,
  m: 60,
  s: 1,
} as const;

export function parseTtlSeconds(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const match = TTL_PATTERN.exec(value);
  if (!match) throw new Error(`Unsupported TTL value: ${value}`);
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof multiplierByUnit;
  return amount * multiplierByUnit[unit];
}
