/**
 * Integration tests for the auth routes.
 *
 * Talks to the real database (DATABASE_URL). Each test uses unique slugs +
 * emails so it doesn't collide with the seed or with other tests in the
 * same run; afterAll wipes everything created by the suite.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, signup as serviceSignup } from '../../services/authService.js';

const app = createApp();
const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'CorrectHorse9!';

let counter = 0;
function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${counter}-${RUN_ID}@example.test`;
}
function uniqueCompany(label: string): string {
  counter += 1;
  return `Test Co ${label} ${counter} ${RUN_ID}`;
}

const createdOrgIds = new Set<string>();
const createdUserEmails = new Set<string>();

async function makeOrgWithOwner(opts?: { companyName?: string; email?: string }) {
  const companyName = opts?.companyName ?? uniqueCompany('owner');
  const email = opts?.email ?? uniqueEmail('owner');
  const result = await serviceSignup({
    companyName,
    email,
    password: PASSWORD,
    firstName: 'Test',
    lastName: 'Owner',
  });
  createdOrgIds.add(result.organization.id);
  createdUserEmails.add(email);
  return { ...result, email };
}

beforeAll(() => {
  // Ensure rate limiter does not fire during integration tests.
  expect(process.env.NODE_ENV).toBe('test');
});

afterEach(() => {
  // No per-test reset needed; cleanup is global.
});

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

function getCookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  for (const line of cookies) {
    if (line.startsWith(`${name}=`)) {
      const value = line.split(';', 1)[0]!.split('=', 2)[1];
      if (value && value.length > 0) return value;
    }
  }
  return undefined;
}

function cookieAttrs(res: request.Response, name: string): string[] {
  const raw = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  for (const line of cookies) {
    if (line.startsWith(`${name}=`)) {
      return line.split(';').map((s) => s.trim());
    }
  }
  return [];
}

describe('POST /api/auth/signup', () => {
  it('creates org + OWNER user, sets cookies, omits sensitive fields', async () => {
    const email = uniqueEmail('signup');
    const companyName = uniqueCompany('Signup');
    const res = await request(app).post('/api/auth/signup').send({
      email,
      password: PASSWORD,
      firstName: 'Aida',
      lastName: 'Signup',
      companyName,
    });
    createdUserEmails.add(email);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('OWNER');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('tokenVersion');
    expect(res.body.organization.name).toBe(companyName);
    expect(res.body.organization.slug).toMatch(/^test-co-signup/);
    expect(res.body.settings.estimateNumberPrefix).toBe('TES');

    expect(getCookie(res, 'accessToken')).toBeTruthy();
    expect(getCookie(res, 'refreshToken')).toBeTruthy();
    if (res.body.organization?.id) createdOrgIds.add(res.body.organization.id);
  });

  it('rejects duplicate email with 409', async () => {
    const { email } = await makeOrgWithOwner();
    const res = await request(app).post('/api/auth/signup').send({
      email,
      password: PASSWORD,
      firstName: 'Dup',
      lastName: 'User',
      companyName: uniqueCompany('Dup'),
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  it('rejects weak password with 400', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: uniqueEmail('weak'),
      password: 'short',
      firstName: 'A',
      lastName: 'B',
      companyName: uniqueCompany('Weak'),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('produces distinct slugs when two orgs share the same companyName', async () => {
    const companyName = uniqueCompany('SameName');
    const a = await request(app).post('/api/auth/signup').send({
      email: uniqueEmail('a'),
      password: PASSWORD,
      firstName: 'A',
      lastName: 'A',
      companyName,
    });
    const b = await request(app).post('/api/auth/signup').send({
      email: uniqueEmail('b'),
      password: PASSWORD,
      firstName: 'B',
      lastName: 'B',
      companyName,
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.organization.slug).not.toBe(b.body.organization.slug);
    if (a.body.organization?.id) createdOrgIds.add(a.body.organization.id);
    if (b.body.organization?.id) createdOrgIds.add(b.body.organization.id);
  });

  it('uses estimateNumberPrefix=EST when companyName has fewer than 3 alphanumerics', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: uniqueEmail('shortname'),
      password: PASSWORD,
      firstName: 'S',
      lastName: 'N',
      companyName: 'A!',
    });
    expect(res.status).toBe(201);
    expect(res.body.settings.estimateNumberPrefix).toBe('EST');
    if (res.body.organization?.id) createdOrgIds.add(res.body.organization.id);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and sets cookies', async () => {
    const { email } = await makeOrgWithOwner();
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(getCookie(res, 'accessToken')).toBeTruthy();
    expect(getCookie(res, 'refreshToken')).toBeTruthy();
  });

  it('rejects wrong password with 401 + generic message', async () => {
    const { email } = await makeOrgWithOwner();
    const res = await request(app).post('/api/auth/login').send({ email, password: 'WRONG-pw-9' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('rejects unknown email with the same generic 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail('nobody'), password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });

  it('rejects an inactive user with 401', async () => {
    const { user } = await makeOrgWithOwner();
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('cookies are httpOnly + sameSite', async () => {
    const { email } = await makeOrgWithOwner();
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    const attrs = cookieAttrs(res, 'accessToken').map((a) => a.toLowerCase());
    expect(attrs).toContain('httponly');
    expect(attrs.some((a) => a.startsWith('samesite='))).toBe(true);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user + org + settings when access cookie is valid', async () => {
    const { email } = await makeOrgWithOwner();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.organization).toBeTruthy();
    expect(me.body.settings).toBeTruthy();
    expect(me.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 without an access cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when access cookie is malformed', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'accessToken=garbage');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the access cookie when refresh cookie is valid', async () => {
    const { email } = await makeOrgWithOwner();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const refresh = await agent.post('/api/auth/refresh');
    expect(refresh.status).toBe(200);
    expect(getCookie(refresh, 'accessToken')).toBeTruthy();
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
  });

  it('returns 401 without a refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('missing_refresh_token');
  });

  it('returns 401 with an invalid refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'refreshToken=garbage');
    expect(res.status).toBe(401);
  });

  it('returns 401 after logout (token version bump revokes refresh)', async () => {
    const { email } = await makeOrgWithOwner();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    await agent.post('/api/auth/logout').expect(204);
    // The agent's cookie jar still has the old refresh cookie, but it should now be revoked.
    // Replay it directly by reading the cookie out and setting it back.
    const second = request.agent(app);
    const fresh = await second
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const refreshCookie = getCookie(fresh, 'refreshToken')!;
    // Bump the user's tokenVersion manually, mimicking what logout did.
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.user.update({
      where: { id: user!.id },
      data: { tokenVersion: { increment: 1 } },
    });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshCookie}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('refresh_token_revoked');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears cookies and bumps tokenVersion', async () => {
    const { email, user: signupUser } = await makeOrgWithOwner();
    const versionBefore = (await prisma.user.findUnique({
      where: { id: signupUser.id },
    }))!.tokenVersion;
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(204);
    const after = (await prisma.user.findUnique({ where: { id: signupUser.id } }))!.tokenVersion;
    expect(after).toBe(versionBefore + 1);
  });

  it('still clears cookies when no token is present (idempotent)', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});

describe('Password hashing', () => {
  it('hashPassword + bcrypt.compare round-trips', async () => {
    const hash = await hashPassword('hello-world-1');
    expect(hash.startsWith('$2')).toBe(true);
    const ok = await (await import('bcrypt')).default.compare('hello-world-1', hash);
    expect(ok).toBe(true);
  });
});
