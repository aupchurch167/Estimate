/**
 * Slug helpers for org names → URL-safe identifiers.
 *
 * Strategy: lowercase + dashify + trim → "mark-allan-contracting". On
 * collision, append short random suffixes ("mark-allan-contracting-x9k2")
 * until the slug is unique.
 */

import { randomBytes } from 'node:crypto';

const MAX_BASE_LENGTH = 60;
const MAX_ATTEMPTS = 5;

export function baseSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LENGTH);
  return slug || 'org';
}

export async function generateUniqueSlug(
  input: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = baseSlug(input);
  if (!(await isTaken(base))) return base;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix = randomBytes(3).toString('hex').slice(0, 5);
    const candidate = `${base}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`Could not generate a unique slug for "${input}" after ${MAX_ATTEMPTS} attempts`);
}

export function buildEstimateNumberPrefix(companyName: string): string {
  const cleaned = companyName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned.length >= 3 ? cleaned.slice(0, 3) : 'EST';
}
