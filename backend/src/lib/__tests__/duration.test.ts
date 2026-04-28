import { describe, expect, it } from 'vitest';
import { durationToMs } from '../duration.js';

describe('durationToMs', () => {
  it('converts each unit', () => {
    expect(durationToMs('500ms')).toBe(500);
    expect(durationToMs('30s')).toBe(30_000);
    expect(durationToMs('15m')).toBe(900_000);
    expect(durationToMs('2h')).toBe(7_200_000);
    expect(durationToMs('7d')).toBe(604_800_000);
  });

  it('throws on invalid input', () => {
    expect(() => durationToMs('15')).toThrow(/Invalid duration/);
    expect(() => durationToMs('abc')).toThrow(/Invalid duration/);
    expect(() => durationToMs('15weeks')).toThrow(/Invalid duration/);
  });
});
