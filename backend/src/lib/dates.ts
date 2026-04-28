/**
 * Date helpers — thin wrappers over date-fns for the operations we use most.
 */

import { addDays as fnsAddDays, differenceInCalendarDays } from 'date-fns';

export function addDays(date: Date, days: number): Date {
  return fnsAddDays(date, days);
}

export function isExpired(date: Date, now: Date = new Date()): boolean {
  return date.getTime() < now.getTime();
}

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(differenceInCalendarDays(b, a));
}
