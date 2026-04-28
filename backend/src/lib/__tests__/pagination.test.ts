import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  getPagination,
} from '../pagination.js';

describe('getPagination', () => {
  it('returns sane defaults for empty / undefined query', () => {
    expect(getPagination(undefined)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
    expect(getPagination({})).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it('parses string page/limit from query strings', () => {
    expect(getPagination({ page: '3', limit: '10' })).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });

  it('treats pageSize as an alias for limit', () => {
    expect(getPagination({ pageSize: '15' })).toMatchObject({ pageSize: 15, take: 15 });
  });

  it('sanitizes page=0 to page=1 and rejects negatives', () => {
    expect(getPagination({ page: '0' }).page).toBe(1);
    expect(getPagination({ page: '-5' }).page).toBe(1);
  });

  it('clamps pageSize over MAX_PAGE_SIZE', () => {
    expect(getPagination({ limit: '5000' }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('falls back to defaults for non-numeric input', () => {
    expect(getPagination({ page: 'banana', limit: 'pancake' })).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it('computes skip from page * pageSize', () => {
    const p = getPagination({ page: '4', limit: '25' });
    expect(p.skip).toBe(75);
    expect(p.take).toBe(25);
  });
});
