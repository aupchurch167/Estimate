import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isExpired } from '../dates.js';

describe('date helpers', () => {
  it('addDays: adds N days', () => {
    const base = new Date('2026-04-28T00:00:00.000Z');
    const result = addDays(base, 7);
    expect(result.toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });

  it('addDays: subtracts when N is negative', () => {
    const base = new Date('2026-04-28T00:00:00.000Z');
    expect(addDays(base, -1).toISOString()).toBe('2026-04-27T00:00:00.000Z');
  });

  it('isExpired: past date is expired, future date is not', () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    expect(isExpired(past)).toBe(true);
    expect(isExpired(future)).toBe(false);
  });

  it('isExpired: respects explicit "now" argument', () => {
    const ref = new Date('2026-04-28T12:00:00.000Z');
    const earlier = new Date('2026-04-28T11:59:59.000Z');
    expect(isExpired(earlier, ref)).toBe(true);
    expect(isExpired(ref, earlier)).toBe(false);
  });

  it('daysBetween: counts calendar days regardless of order', () => {
    const a = new Date('2026-04-28T00:00:00.000Z');
    const b = new Date('2026-05-05T00:00:00.000Z');
    expect(daysBetween(a, b)).toBe(7);
    expect(daysBetween(b, a)).toBe(7);
  });

  it('daysBetween: returns 0 for the same calendar day', () => {
    const a = new Date('2026-04-28T01:00:00.000Z');
    const b = new Date('2026-04-28T23:30:00.000Z');
    expect(daysBetween(a, b)).toBe(0);
  });
});
