/**
 * Rate-limit middleware factories.
 *
 * `authLimiter`: 5 requests/minute/IP. Applied to /signup and /login per
 * brief Section 10. The limiter uses an in-process memory store — fine for
 * a single MVP droplet; revisit when we go multi-instance.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../lib/env.js';

const RATE_LIMITED_BODY = {
  error: {
    code: 'rate_limited',
    message: 'Too many attempts. Please wait a minute and try again.',
  },
};

export function createAuthLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: RATE_LIMITED_BODY,
    skip: () => env.NODE_ENV === 'test',
    ...overrides,
  });
}

// Default limiter wired into the auth router. Tests can build their own via
// `createAuthLimiter({ skip: () => false })` to exercise the 429 behavior.
export const authLimiter = createAuthLimiter();
