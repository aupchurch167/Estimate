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
    // Use local-time constructors so the test is timezone-independent —
    // differenceInCalendarDays operates on local calendar days.
    const a = new Date(2026, 3, 28, 12, 0); // Apr 28 12:00 local
    const b = new Date(2026, 4, 5, 12, 0); // May 5  12:00 local
    expect(daysBetween(a, b)).toBe(7);
    expect(daysBetween(b, a)).toBe(7);
  });

  it('daysBetween: returns 0 for the same calendar day', () => {
    // Local-time constructor → both stamps live on the same local
    // calendar day in any timezone.
    const a = new Date(2026, 3, 28, 1, 0); // Apr 28 01:00 local
    const b = new Date(2026, 3, 28, 23, 30); // Apr 28 23:30 local
    expect(daysBetween(a, b)).toBe(0);
  });
});
