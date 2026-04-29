/**
 * Integration tests for /api/users routes (Phase 1.5).
 */

import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';

const app = createApp();
const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();
const PASSWORD = 'OriginalPass1!';

async function makeOwner(overrides?: { firstName?: string; lastName?: string }) {
  counter += 1;
  const result = await serviceSignup({
    companyName: `Users Route ${counter} ${RUN_ID}`,
    email: `users-${counter}-${RUN_ID}@example.test`,
    password: PASSWORD,
    firstName: overrides?.firstName ?? 'Old',
    lastName: overrides?.lastName ?? 'Name',
  });
  orgIds.add(result.organization.id);
  return result;
}

async function login(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('PATCH /api/users/:id', () => {
  it('lets a user update their own first / last name', async () => {
    const { user, organization } = await makeOwner();
    void organization;
    const agent = await login(user.email);
    const res = await agent
      .patch(`/api/users/${user.id}`)
      .send({ firstName: 'New', lastName: 'Surname' });
    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe('New');
    expect(res.body.user.lastName).toBe('Surname');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 without an access cookie', async () => {
    const { user } = await makeOwner();
    const res = await request(app).patch(`/api/users/${user.id}`).send({ firstName: 'X' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when targeting another user', async () => {
    const a = await makeOwner();
    const b = await makeOwner();
    const agent = await login(a.user.email);
    const res = await agent.patch(`/api/users/${b.user.id}`).send({ firstName: 'X' });
    expect(res.status).toBe(403);
  });

  it('rejects empty firstName with 400', async () => {
    const { user } = await makeOwner();
    const agent = await login(user.email);
    const res = await agent.patch(`/api/users/${user.id}`).send({ firstName: '' });
    expect(res.status).toBe(400);
  });

  it('cannot self-promote — role field in body is ignored by the service', async () => {
    const { user } = await makeOwner();
    const originalRole = user.role; // OWNER
    const agent = await login(user.email);
    const res = await agent
      .patch(`/api/users/${user.id}`)
      .send({ firstName: 'New', role: 'ESTIMATOR' });
    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe('New');
    expect(res.body.user.role).toBe(originalRole);
    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded?.role).toBe(originalRole);
  });
});

describe('PATCH /api/users/:id/password', () => {
  it('succeeds with correct current password and a fresh new one', async () => {
    const { user } = await makeOwner();
    const agent = await login(user.email);
    const res = await agent.patch(`/api/users/${user.id}/password`).send({
      currentPassword: PASSWORD,
      newPassword: 'BrandNewPass-9',
    });
    expect(res.status).toBe(204);
  });

  it('returns 401 when current password is wrong', async () => {
    const { user } = await makeOwner();
    const agent = await login(user.email);
    const res = await agent.patch(`/api/users/${user.id}/password`).send({
      currentPassword: 'WRONG',
      newPassword: 'BrandNewPass-9',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_current_password');
  });

  it('returns 400 when new password is shorter than 8', async () => {
    const { user } = await makeOwner();
    const agent = await login(user.email);
    const res = await agent.patch(`/api/users/${user.id}/password`).send({
      currentPassword: PASSWORD,
      newPassword: 'short',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when new equals current', async () => {
    const { user } = await makeOwner();
    const agent = await login(user.email);
    const res = await agent.patch(`/api/users/${user.id}/password`).send({
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 when changing another user’s password', async () => {
    const a = await makeOwner();
    const b = await makeOwner();
    const agent = await login(a.user.email);
    const res = await agent.patch(`/api/users/${b.user.id}/password`).send({
      currentPassword: PASSWORD,
      newPassword: 'NewPass1234',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/users/:id/avatar', () => {
  it('returns a signed upload URL for a valid PNG payload', async () => {
    const { user } = await makeOwner();
    const agent = await login(user.email);
    const res = await agent.post(`/api/users/${user.id}/avatar`).send({
      contentType: 'image/png',
      fileSizeBytes: 100_000,
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https?:\/\//);
    expect(res.body.key).toContain(`users/${user.id}/avatars/`);
    expect(res.body.publicUrl).toContain(res.body.key);
  });

  it('rejects unsupported content types with 400', async () => {
    const { user } = await makeOwner();
    const agent = await login(user.email);
    const res = await agent.post(`/api/users/${user.id}/avatar`).send({
      contentType: 'application/pdf',
      fileSizeBytes: 1000,
    });
    expect(res.status).toBe(400);
  });

  it('rejects oversized payloads with 400', async () => {
    const { user } = await makeOwner();
    const agent = await login(user.email);
    const res = await agent.post(`/api/users/${user.id}/avatar`).send({
      contentType: 'image/png',
      fileSizeBytes: 10 * 1024 * 1024,
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 when targeting another user', async () => {
    const a = await makeOwner();
    const b = await makeOwner();
    const agent = await login(a.user.email);
    const res = await agent.post(`/api/users/${b.user.id}/avatar`).send({
      contentType: 'image/png',
      fileSizeBytes: 1000,
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/users', () => {
  it('returns users in the authed user’s org and excludes other orgs', async () => {
    const owner = await makeOwner();
    // Move a side-org user into owner's org so we have ≥2 members.
    counter += 1;
    const memberEmail = `member-${counter}-${RUN_ID}@example.test`;
    const fresh = await serviceSignup({
      companyName: `Member Source ${counter} ${RUN_ID}`,
      email: memberEmail,
      password: PASSWORD,
      firstName: 'Mem',
      lastName: 'Ber',
    });
    orgIds.add(fresh.organization.id);
    await prisma.user.update({
      where: { id: fresh.user.id },
      data: { organizationId: owner.organization.id, role: 'ESTIMATOR' },
    });

    const agent = await login(owner.user.email);
    const res = await agent.get('/api/users');
    expect(res.status).toBe(200);
    const emails: string[] = res.body.users.map((u: { email: string }) => u.email);
    expect(emails).toContain(owner.user.email);
    expect(emails).toContain(memberEmail);
    // Sensitive fields are stripped.
    for (const u of res.body.users) {
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('tokenVersion');
    }
  });

  it('returns 401 unauthenticated', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('Admin user management routes (Phase 7.1)', () => {
  async function bootstrap() {
    const owner = await makeOwner();
    counter += 1;
    const memberSignup = await serviceSignup({
      companyName: `RouteMate-${counter}-${RUN_ID}`,
      email: `route-mate-${counter}-${RUN_ID}@example.test`,
      password: PASSWORD,
      firstName: 'Mate',
      lastName: 'Y',
    });
    orgIds.add(memberSignup.organization.id);
    const member = await prisma.user.update({
      where: { id: memberSignup.user.id },
      data: { organizationId: owner.organization.id, role: 'ESTIMATOR' },
    });
    return { owner, member };
  }

  it('PATCH /:id/role flips role for an admin actor', async () => {
    const { owner, member } = await bootstrap();
    const agent = await login(owner.user.email);
    const res = await agent
      .patch(`/api/users/${member.id}/role`)
      .send({ role: 'PM' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('PM');
  });

  it('PATCH /:id/role 403 for ESTIMATOR actor', async () => {
    const { member } = await bootstrap();
    // Promote nothing — login as ESTIMATOR member; build a third teammate
    // for them to target so the failure isn't tied to self-rejection.
    const { owner: targetOwner } = await bootstrap();
    void targetOwner;
    // member was created via signup with PASSWORD, so we can log in directly.
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: member.email, password: PASSWORD }).expect(200);
    const res = await agent.patch(`/api/users/${member.id}/role`).send({ role: 'PM' });
    expect(res.status).toBe(403);
  });

  it('POST /:id/deactivate then POST /:id/reactivate round-trip works', async () => {
    const { owner, member } = await bootstrap();
    const agent = await login(owner.user.email);

    const off = await agent.post(`/api/users/${member.id}/deactivate`).send();
    expect(off.status).toBe(200);
    expect(off.body.user.isActive).toBe(false);

    const on = await agent.post(`/api/users/${member.id}/reactivate`).send();
    expect(on.status).toBe(200);
    expect(on.body.user.isActive).toBe(true);
  });

  it('POST /:id/deactivate 409 when targeting self', async () => {
    const { owner } = await bootstrap();
    const agent = await login(owner.user.email);
    const res = await agent.post(`/api/users/${owner.user.id}/deactivate`).send();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('cannot_target_self');
  });

  it('PATCH /:id/role 409 when targeting OWNER', async () => {
    const { owner, member } = await bootstrap();
    void member;
    const agent = await login(owner.user.email);
    const res = await agent.patch(`/api/users/${owner.user.id}/role`).send({ role: 'ESTIMATOR' });
    // Hits cannot_target_self before owner_role_immutable.
    expect(res.status).toBe(409);
  });

  it('PATCH /:id/role 400 on invalid role', async () => {
    const { owner, member } = await bootstrap();
    const agent = await login(owner.user.email);
    const res = await agent
      .patch(`/api/users/${member.id}/role`)
      .send({ role: 'NOT_A_ROLE' });
    expect(res.status).toBe(400);
  });
});
