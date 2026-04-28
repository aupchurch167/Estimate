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
