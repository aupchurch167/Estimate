import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '@prisma/client';
import { requireRole } from '../requireRole.js';
import { errorHandler } from '../errorHandler.js';

function buildApp(role: UserRole | null, allowed: UserRole[]) {
  const app = express();
  app.use((req, _res, next) => {
    if (role) {
      // mimic what requireAuth would attach. The real type expects a full
      // Prisma User; the middleware only reads .id and .role so the
      // partial is enough for this test.
      (req as unknown as { user: { id: string; role: UserRole } }).user = {
        id: 'test-user',
        role,
      };
    }
    next();
  });
  app.get('/guarded', requireRole(...allowed), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('requireRole middleware', () => {
  it('returns 401 when no user is on req (requireAuth not run)', async () => {
    const app = buildApp(null, ['OWNER']);
    const res = await request(app).get('/guarded');
    expect(res.status).toBe(401);
  });

  it('returns 200 when role is in the allowlist', async () => {
    const app = buildApp('OWNER', ['OWNER', 'ADMIN']);
    const res = await request(app).get('/guarded');
    expect(res.status).toBe(200);
  });

  it.each<UserRole>(['ESTIMATOR', 'PM', 'VIEWER'])(
    'returns 403 with details when role %s is excluded',
    async (role) => {
      const app = buildApp(role, ['OWNER', 'ADMIN']);
      const res = await request(app).get('/guarded');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
      expect(res.body.error.details).toEqual({
        requiredRoles: ['OWNER', 'ADMIN'],
        actualRole: role,
      });
    },
  );

  it('throws at config time when no roles are passed', () => {
    expect(() => requireRole()).toThrow(/at least one is required/);
  });
});
