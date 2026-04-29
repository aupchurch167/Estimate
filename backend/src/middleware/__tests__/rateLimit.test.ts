import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAiLimiter, createAuthLimiter } from '../rateLimit.js';

describe('authLimiter (5 req/min/IP)', () => {
  it('returns 429 on the 6th request inside the window', async () => {
    const app = express();
    app.post('/throttled', createAuthLimiter({ skip: () => false }), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    for (let i = 1; i <= 5; i++) {
      const res = await request(app).post('/throttled');
      expect(res.status).toBe(200);
    }
    const sixth = await request(app).post('/throttled');
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('rate_limited');
  });
});

describe('aiLimiter (20 AI runs/min/user)', () => {
  function appWith(userId: string | undefined) {
    const app = express();
    // Stub auth: set req.user so the limiter's keyGenerator can read it.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (userId) {
        // The real Request['user'] is the full Prisma User; the limiter
        // only reads `.id`, so a partial stub is enough for this test.
        (req as unknown as { user: { id: string } }).user = { id: userId };
      }
      next();
    });
    app.post('/ai-throttled', createAiLimiter({ skip: () => false }), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it('returns 429 with code ai_rate_limited_local on the 21st request', async () => {
    const app = appWith('user-a');
    for (let i = 1; i <= 20; i++) {
      const res = await request(app).post('/ai-throttled');
      expect(res.status).toBe(200);
    }
    const twentyFirst = await request(app).post('/ai-throttled');
    expect(twentyFirst.status).toBe(429);
    expect(twentyFirst.body.error.code).toBe('ai_rate_limited_local');
  });

  it('two distinct users do not share a bucket', async () => {
    const appA = appWith('user-a');
    const appB = appWith('user-b');
    // Burn user-a to its limit.
    for (let i = 0; i < 20; i++) {
      await request(appA).post('/ai-throttled');
    }
    // user-a is now blocked …
    const aBlocked = await request(appA).post('/ai-throttled');
    expect(aBlocked.status).toBe(429);
    // … but user-b has a fresh bucket.
    const bOk = await request(appB).post('/ai-throttled');
    expect(bOk.status).toBe(200);
  });
});
