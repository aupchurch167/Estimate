/**
 * Convert duration strings like "15m" / "7d" to milliseconds.
 *
 * Used by jwt and cookies modules to keep their TTLs in lockstep with the
 * JWT_*_EXPIRES_IN env values.
 */

const UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
} as const;

type Unit = keyof typeof UNITS;

export function durationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) throw new Error(`Invalid duration string: ${value}`);
  const [, n, unit] = match;
  return Number(n) * UNITS[unit as Unit];
}
