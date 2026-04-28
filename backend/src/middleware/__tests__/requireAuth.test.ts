/**
 * Integration tests for the requireAuth middleware. Mounts a tiny app with
 * a single guarded route, then probes the auth gate from every angle:
 * missing/invalid/expired tokens and inactive users.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireAuth } from '../requireAuth.js';
import { errorHandler } from '../errorHandler.js';
import { signAccessToken } from '../../lib/jwt.js';
import { ACCESS_COOKIE } from '../../lib/cookies.js';
import { env } from '../../lib/env.js';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';

function buildGuardedApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth, (req, res) => {
    res.json({
      userId: req.user?.id,
      orgId: req.organization?.id,
      hasSettings: Boolean(req.settings),
    });
  });
  app.use(errorHandler);
  return app;
}

const RUN_ID = `t${Date.now().toString(36)}`;
let userId = '';
let orgId = '';
let validToken = '';

beforeAll(async () => {
  const result = await serviceSignup({
    companyName: `RequireAuth Co ${RUN_ID}`,
    email: `require-auth-${RUN_ID}@example.test`,
    password: 'password123',
    firstName: 'Req',
    lastName: 'Auth',
  });
  userId = result.user.id;
  orgId = result.organization.id;
  validToken = result.tokens.accessToken;
});

afterAll(async () => {
  if (orgId) {
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('requireAuth middleware', () => {
  it('rejects requests with no access cookie (401)', async () => {
    const app = buildGuardedApp();
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('not_authenticated');
  });

  it('rejects an invalid-signature access token (401)', async () => {
    const app = buildGuardedApp();
    const fake = jwt.sign({ sub: userId, organizationId: orgId }, 'wrong-secret');
    const res = await request(app)
      .get('/protected')
      .set('Cookie', `${ACCESS_COOKIE}=${fake}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired access token (401)', async () => {
    const app = buildGuardedApp();
    const expired = jwt.sign({ sub: userId, organizationId: orgId }, env.JWT_ACCESS_SECRET, {
      expiresIn: '-1s',
    });
    const res = await request(app)
      .get('/protected')
      .set('Cookie', `${ACCESS_COOKIE}=${expired}`);
    expect(res.status).toBe(401);
  });

  it('rejects when the user is inactive (401)', async () => {
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    try {
      const token = signAccessToken({ sub: userId, organizationId: orgId });
      const app = buildGuardedApp();
      const res = await request(app)
        .get('/protected')
        .set('Cookie', `${ACCESS_COOKIE}=${token}`);
      expect(res.status).toBe(401);
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    }
  });

  it('passes a valid token through and populates req.user/organization/settings', async () => {
    const app = buildGuardedApp();
    const res = await request(app)
      .get('/protected')
      .set('Cookie', `${ACCESS_COOKIE}=${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(res.body.orgId).toBe(orgId);
    expect(res.body.hasSettings).toBe(true);
  });
});
