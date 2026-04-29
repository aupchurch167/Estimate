/**
 * Integration tests for /api/organizations.
 *
 * Each test creates a fresh org via signup so the seeded MAC org isn't
 * mutated. Disposable orgs are wiped in afterAll.
 */

import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';

const app = createApp();
const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PASSWORD = 'OriginalPass1!';
let counter = 0;
const orgIds = new Set<string>();

async function makeOwner() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `Org Tests ${counter} ${RUN_ID}`,
    email: `org-${counter}-${RUN_ID}@example.test`,
    password: PASSWORD,
    firstName: 'Test',
    lastName: 'Owner',
  });
  orgIds.add(result.organization.id);
  return result;
}

async function loginAs(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

async function makeNonAdmin(orgId: string, role: 'PM' | 'VIEWER' | 'ESTIMATOR') {
  counter += 1;
  const email = `nonadmin-${counter}-${RUN_ID}@example.test`;
  // Use the same hashing the auth service uses by signing up + then promoting.
  // Simpler: signup as a fresh OWNER (bcrypt), then move that user into the
  // target org with the desired role. Original org is then unused, but it's
  // tracked for cleanup.
  const fresh = await serviceSignup({
    companyName: `Member Source ${counter} ${RUN_ID}`,
    email,
    password: PASSWORD,
    firstName: 'Mem',
    lastName: 'Ber',
  });
  orgIds.add(fresh.organization.id);
  await prisma.user.update({
    where: { id: fresh.user.id },
    data: { organizationId: orgId, role },
  });
  return { email, userId: fresh.user.id };
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

describe('GET /api/organizations/current', () => {
  it('returns the authed user’s org + settings', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent.get('/api/organizations/current');
    expect(res.status).toBe(200);
    expect(res.body.organization.id).toBe(organization.id);
    expect(res.body.settings).toBeTruthy();
    expect(res.body.settings.estimateNumberPrefix).toBeTypeOf('string');
  });

  it('returns 401 unauthenticated', async () => {
    const res = await request(app).get('/api/organizations/current');
    expect(res.status).toBe(401);
  });

  it('is readable by non-admin members of the org', async () => {
    const { organization } = await makeOwner();
    const member = await makeNonAdmin(organization.id, 'VIEWER');
    const agent = await loginAs(member.email);
    const res = await agent.get('/api/organizations/current');
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/organizations/current', () => {
  it('updates the org name as OWNER', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .patch('/api/organizations/current')
      .send({ name: 'Renamed Co' });
    expect(res.status).toBe(200);
    expect(res.body.organization.name).toBe('Renamed Co');
    expect(res.body.organization.id).toBe(organization.id);
  });

  it('returns 403 for non-admin members', async () => {
    const { organization } = await makeOwner();
    const member = await makeNonAdmin(organization.id, 'PM');
    const agent = await loginAs(member.email);
    const res = await agent.patch('/api/organizations/current').send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/organizations/current/settings', () => {
  it('updates assorted fields with valid input', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent.patch('/api/organizations/current/settings').send({
      primaryColorHex: '#1D3D6B',
      contactPhone: '(555) 999-0000',
      estimateNumberPrefix: 'aBc1',
      defaultMarkupPercent: '0.25',
      drafterCanSend: false,
      timezone: 'America/Chicago',
      monthlyAiCostCapUsd: '300',
    });
    expect(res.status).toBe(200);
    expect(res.body.settings.primaryColorHex).toBe('#1D3D6B');
    expect(res.body.settings.contactPhone).toBe('(555) 999-0000');
    // estimatePrefix is sanitized to uppercase; we sent "aBc1" → expect "ABC1".
    expect(res.body.settings.estimateNumberPrefix).toBe('ABC1');
    expect(res.body.settings.drafterCanSend).toBe(false);
    expect(res.body.settings.timezone).toBe('America/Chicago');
    expect(String(res.body.settings.monthlyAiCostCapUsd)).toBe('300');
  });

  it('rejects invalid hex color with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .patch('/api/organizations/current/settings')
      .send({ primaryColorHex: 'not-a-color' });
    expect(res.status).toBe(400);
  });

  it('rejects markup outside [0, 1] with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const tooHigh = await agent
      .patch('/api/organizations/current/settings')
      .send({ defaultMarkupPercent: '1.5' });
    expect(tooHigh.status).toBe(400);
    const negative = await agent
      .patch('/api/organizations/current/settings')
      .send({ defaultMarkupPercent: '-0.1' });
    expect(negative.status).toBe(400);
  });

  it('rejects an unknown timezone with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .patch('/api/organizations/current/settings')
      .send({ timezone: 'Mars/Olympus' });
    expect(res.status).toBe(400);
  });

  it('rejects setting monthlyAiCostCapUsd to null without confirmUnlimited', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .patch('/api/organizations/current/settings')
      .send({ monthlyAiCostCapUsd: null });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0].path).toBe('monthlyAiCostCapUsd');
  });

  it('accepts monthlyAiCostCapUsd null when confirmUnlimited:true', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .patch('/api/organizations/current/settings')
      .send({ monthlyAiCostCapUsd: null, confirmUnlimited: true });
    expect(res.status).toBe(200);
    expect(res.body.settings.monthlyAiCostCapUsd).toBeNull();
  });

  it('returns 403 for non-admin members', async () => {
    const { organization } = await makeOwner();
    const member = await makeNonAdmin(organization.id, 'ESTIMATOR');
    const agent = await loginAs(member.email);
    const res = await agent
      .patch('/api/organizations/current/settings')
      .send({ defaultMarkupPercent: '0.10' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/organizations/current/logo', () => {
  it('returns a signed upload URL for an admin', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent.post('/api/organizations/current/logo').send({
      contentType: 'image/png',
      fileSizeBytes: 200_000,
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https?:\/\//);
    expect(res.body.key).toContain('orgs/');
    expect(res.body.key).toContain('/logo/');
  });

  it('rejects an unsupported MIME with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .post('/api/organizations/current/logo')
      .send({ contentType: 'application/pdf', fileSizeBytes: 1000 });
    expect(res.status).toBe(400);
  });

  it('returns 403 for non-admin members', async () => {
    const { organization } = await makeOwner();
    const member = await makeNonAdmin(organization.id, 'VIEWER');
    const agent = await loginAs(member.email);
    const res = await agent
      .post('/api/organizations/current/logo')
      .send({ contentType: 'image/png', fileSizeBytes: 1000 });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/organizations/current — Danger Zone', () => {
  it('OWNER can delete with matching confirmName; org gets deletedAt; member sessions invalidated', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .delete('/api/organizations/current')
      .send({ confirmName: organization.name });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(organization.id);

    const fresh = await prisma.organization.findUniqueOrThrow({
      where: { id: organization.id },
    });
    expect(fresh.deletedAt).toBeInstanceOf(Date);

    // Subsequent request through requireAuth should now 401 because the
    // org is soft-deleted.
    const after = await agent.get('/api/organizations/current');
    expect(after.status).toBe(401);
  });

  it('rejects with 409 + org_name_mismatch when confirmName is wrong', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .delete('/api/organizations/current')
      .send({ confirmName: `${organization.name}-wrong` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('org_name_mismatch');

    const fresh = await prisma.organization.findUniqueOrThrow({
      where: { id: organization.id },
    });
    expect(fresh.deletedAt).toBeNull();
  });

  it('returns 403 for ADMIN (only OWNER can delete)', async () => {
    const { organization } = await makeOwner();
    counter += 1;
    const adminSignup = await serviceSignup({
      companyName: `Adm-Del-${counter}-${RUN_ID}`,
      email: `adel-${counter}-${RUN_ID}@example.test`,
      password: PASSWORD,
      firstName: 'A',
      lastName: 'D',
    });
    orgIds.add(adminSignup.organization.id);
    const admin = await prisma.user.update({
      where: { id: adminSignup.user.id },
      data: { organizationId: organization.id, role: 'ADMIN' },
    });
    const agent = await loginAs(admin.email);
    const res = await agent
      .delete('/api/organizations/current')
      .send({ confirmName: organization.name });
    expect(res.status).toBe(403);
  });
});
