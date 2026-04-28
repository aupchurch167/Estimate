/**
 * ID and token helpers.
 *
 * Most primary IDs come from Prisma's `cuid()` defaults. When we need a
 * URL-safe random secret (invitation tokens, signed-link nonces, etc.)
 * use `generateToken(bytes)` — it returns base64url-encoded crypto-random
 * bytes, defaulting to 32 bytes (~43 chars).
 */

import { randomBytes } from 'node:crypto';

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
