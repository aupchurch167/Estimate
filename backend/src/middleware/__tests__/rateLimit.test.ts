import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthLimiter } from '../rateLimit.js';

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
