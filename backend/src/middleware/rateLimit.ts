/**
 * Rate-limit middleware factories.
 *
 * `authLimiter`: 5 requests/minute/IP. Applied to /signup and /login per
 * brief Section 10. The limiter uses an in-process memory store — fine for
 * a single MVP droplet; revisit when we go multi-instance.
 *
 * `aiLimiter`: 20 AI runs/minute per authenticated user. Applied to
 * POST /api/estimates/:id/ai-runs as cheap insurance against runaway
 * loops (a buggy retry on the client, an admin testing 50 estimates in a
 * row) — both spike Anthropic spend and breach the cost cap. Anonymous
 * requests fall back to IP-based limiting at the same threshold.
 */

import type { Request } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { env } from '../lib/env.js';

const RATE_LIMITED_BODY = {
  error: {
    code: 'rate_limited',
    message: 'Too many attempts. Please wait a minute and try again.',
  },
};

const AI_RATE_LIMITED_BODY = {
  error: {
    code: 'ai_rate_limited_local',
    message: 'You are running AI requests too quickly. Wait a minute and retry.',
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

export function createAiLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: AI_RATE_LIMITED_BODY,
    skip: () => env.NODE_ENV === 'test',
    keyGenerator: (req: Request) => {
      // Per-user when authenticated so two users on the same office IP
      // don't share a bucket. The IP fallback (the rare unauthenticated
      // case) goes through ipKeyGenerator so IPv6 addresses are bucketed
      // correctly per express-rate-limit's IPv6 safety rule.
      if (req.user?.id) return `user:${req.user.id}`;
      return ipKeyGenerator(req.ip ?? '');
    },
    ...overrides,
  });
}

export const aiLimiter = createAiLimiter();
