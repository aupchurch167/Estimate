import { describe, expect, it } from 'vitest';
import { baseSlug, buildEstimateNumberPrefix, generateUniqueSlug } from '../slug.js';

describe('baseSlug', () => {
  it('lowercases, dashifies, trims', () => {
    expect(baseSlug('Mark Allan Contracting, LLC')).toBe('mark-allan-contracting-llc');
  });

  it('collapses runs of non-alphanumeric chars', () => {
    expect(baseSlug('A & B   --   C')).toBe('a-b-c');
  });

  it('falls back to "org" when input has no alphanumerics', () => {
    expect(baseSlug('!!!---')).toBe('org');
    expect(baseSlug('')).toBe('org');
  });

  it('truncates to 60 chars', () => {
    const long = 'a'.repeat(80);
    expect(baseSlug(long).length).toBe(60);
  });
});

describe('generateUniqueSlug', () => {
  it('returns the base slug if not taken', async () => {
    const slug = await generateUniqueSlug('Mark Allan Contracting', async () => false);
    expect(slug).toBe('mark-allan-contracting');
  });

  it('appends a random suffix on collision', async () => {
    const taken = new Set(['mark-allan-contracting']);
    const slug = await generateUniqueSlug('Mark Allan Contracting', async (s) => taken.has(s));
    expect(slug).toMatch(/^mark-allan-contracting-[0-9a-f]{1,5}$/);
    expect(slug).not.toBe('mark-allan-contracting');
  });

  it('throws if all attempts collide', async () => {
    await expect(generateUniqueSlug('foo', async () => true)).rejects.toThrow(/unique slug/);
  });
});

describe('buildEstimateNumberPrefix', () => {
  it('takes first 3 alphanumerics, uppercased', () => {
    expect(buildEstimateNumberPrefix('Mark Allan Contracting')).toBe('MAR');
    expect(buildEstimateNumberPrefix('built different')).toBe('BUI');
  });

  it('falls back to EST when fewer than 3 alphanumerics', () => {
    expect(buildEstimateNumberPrefix('A!')).toBe('EST');
    expect(buildEstimateNumberPrefix('')).toBe('EST');
    expect(buildEstimateNumberPrefix('---')).toBe('EST');
  });

  it('skips non-alphanumeric chars when picking the first 3', () => {
    expect(buildEstimateNumberPrefix('!Acme Corp!')).toBe('ACM');
  });
});
