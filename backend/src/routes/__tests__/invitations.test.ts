/**
 * Integration tests for /api/invitations.
 *
 * Each test creates a fresh disposable org so tests are independent and
 * the seed data is untouched. afterAll wipes everything created by the run.
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
    companyName: `Invite Tests ${counter} ${RUN_ID}`,
    email: `inv-owner-${counter}-${RUN_ID}@example.test`,
    password: PASSWORD,
    firstName: 'Adm',
    lastName: 'In',
  });
  orgIds.add(result.organization.id);
  return result;
}

async function loginAs(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

function inviteEmail() {
  counter += 1;
  return `invitee-${counter}-${RUN_ID}@example.test`;
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.invitation.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('POST /api/invitations', () => {
  it('OWNER can create an invitation; response shape includes token URL + status', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const email = inviteEmail();
    const res = await agent.post('/api/invitations').send({ email, role: 'ESTIMATOR' });
    expect(res.status).toBe(201);
    expect(res.body.invitation.email).toBe(email);
    expect(res.body.invitation.role).toBe('ESTIMATOR');
    expect(res.body.invitation.status).toBe('PENDING');
    expect(res.body.acceptUrl).toMatch(/\/invite\/[A-Za-z0-9_-]{30,}$/);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'ESTIMATOR' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when invoked as ESTIMATOR', async () => {
    const { user, organization } = await makeOwner();
    // Promote a side user into the org as ESTIMATOR (auth via signup, then move).
    counter += 1;
    const estEmail = `est-${counter}-${RUN_ID}@example.test`;
    const fresh = await serviceSignup({
      companyName: `Member Source ${counter} ${RUN_ID}`,
      email: estEmail,
      password: PASSWORD,
      firstName: 'E',
      lastName: 'St',
    });
    orgIds.add(fresh.organization.id);
    await prisma.user.update({
      where: { id: fresh.user.id },
      data: { organizationId: organization.id, role: 'ESTIMATOR' },
    });
    void user;
    const agent = await loginAs(estEmail);
    const res = await agent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'ESTIMATOR' });
    expect(res.status).toBe(403);
  });

  it('rejects role=OWNER with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'OWNER' });
    expect(res.status).toBe(400);
  });

  it('rejects an email that already belongs to a User with 409', async () => {
    const { user } = await makeOwner();
    const second = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .post('/api/invitations')
      .send({ email: second.user.email, role: 'ESTIMATOR' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('user_already_exists');
  });

  it('rejects a duplicate pending invitation with 409', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const email = inviteEmail();
    const first = await agent.post('/api/invitations').send({ email, role: 'ESTIMATOR' });
    expect(first.status).toBe(201);
    const second = await agent.post('/api/invitations').send({ email, role: 'PM' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('invitation_pending');
  });
});

describe('GET /api/invitations', () => {
  it('lists invitations and supports status filter', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const a = await agent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'ESTIMATOR' });
    const b = await agent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'PM' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    await agent.delete(`/api/invitations/${b.body.invitation.id}`).expect(204);

    const all = await agent.get('/api/invitations');
    expect(all.status).toBe(200);
    expect(all.body.invitations.length).toBe(2);

    const pending = await agent.get('/api/invitations?status=pending');
    expect(pending.body.invitations.length).toBe(1);
    expect(pending.body.invitations[0].id).toBe(a.body.invitation.id);

    const revoked = await agent.get('/api/invitations?status=revoked');
    expect(revoked.body.invitations.length).toBe(1);
    expect(revoked.body.invitations[0].id).toBe(b.body.invitation.id);
  });
});

describe('DELETE /api/invitations/:id', () => {
  it('revokes a pending invitation, idempotent on second call', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = await agent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'ESTIMATOR' });
    const id = created.body.invitation.id;
    expect((await agent.delete(`/api/invitations/${id}`)).status).toBe(204);
    expect((await agent.delete(`/api/invitations/${id}`)).status).toBe(204);
  });

  it('returns 404 when targeting another org’s invitation', async () => {
    const a = await makeOwner();
    const b = await makeOwner();
    const aAgent = await loginAs(a.user.email);
    const bAgent = await loginAs(b.user.email);
    const created = await bAgent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'ESTIMATOR' });
    const res = await aAgent.delete(`/api/invitations/${created.body.invitation.id}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/invitations/:token (public)', () => {
  it('returns the public view when pending', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const email = inviteEmail();
    const created = await agent
      .post('/api/invitations')
      .send({ email, role: 'ESTIMATOR' });
    const token = created.body.acceptUrl.split('/').pop();
    const res = await request(app).get(`/api/invitations/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.role).toBe('ESTIMATOR');
    expect(res.body.organizationName).toBeTruthy();
    expect(res.body.inviterName).toBeTruthy();
  });

  it('returns 410 Gone for a revoked invitation', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = await agent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'ESTIMATOR' });
    const token = created.body.acceptUrl.split('/').pop();
    await agent.delete(`/api/invitations/${created.body.invitation.id}`).expect(204);
    const res = await request(app).get(`/api/invitations/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.error.details.status).toBe('REVOKED');
  });

  it('returns 410 Gone for an expired invitation', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = await agent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'ESTIMATOR' });
    const token = created.body.acceptUrl.split('/').pop();
    // Push expiry into the past via direct DB write.
    await prisma.invitation.update({
      where: { id: created.body.invitation.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await request(app).get(`/api/invitations/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.error.details.status).toBe('EXPIRED');
  });

  it('returns 404 for an unknown token', async () => {
    const res = await request(app).get('/api/invitations/no-such-token');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/invitations/:token/accept', () => {
  it('creates the user, links the invitation, fires notification + activity, sets cookies', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const email = inviteEmail();
    const created = await agent
      .post('/api/invitations')
      .send({ email, role: 'PM' });
    const token = created.body.acceptUrl.split('/').pop();

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send({ email, password: 'AcceptPass-1', firstName: 'New', lastName: 'Member' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('PM');
    expect(res.body.user.organizationId).toBe(organization.id);
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookies = res.headers['set-cookie'];
    const cookieList = Array.isArray(cookies) ? cookies : cookies ? [String(cookies)] : [];
    expect(cookieList.some((c) => c.startsWith('accessToken='))).toBe(true);
    expect(cookieList.some((c) => c.startsWith('refreshToken='))).toBe(true);

    const fresh = await prisma.invitation.findUnique({
      where: { id: created.body.invitation.id },
    });
    expect(fresh?.acceptedAt).not.toBeNull();
    expect(fresh?.acceptedUserId).toBe(res.body.user.id);

    const notif = await prisma.notification.findFirst({
      where: { recipientId: user.id, type: 'INVITATION_ACCEPTED' },
    });
    expect(notif).toBeTruthy();

    const activity = await prisma.activityEvent.findFirst({
      where: { organizationId: organization.id, eventType: 'USER_JOINED' },
    });
    expect(activity).toBeTruthy();
  });

  it('rejects with 400 when submitted email differs from the invitation', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = await agent
      .post('/api/invitations')
      .send({ email: inviteEmail(), role: 'ESTIMATOR' });
    const token = created.body.acceptUrl.split('/').pop();

    const res = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send({
        email: 'someone-else@example.test',
        password: 'AcceptPass-1',
        firstName: 'Wrong',
        lastName: 'Email',
      });
    expect(res.status).toBe(400);
  });

  it('rejects with 410 once the invitation has been accepted', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const email = inviteEmail();
    const created = await agent
      .post('/api/invitations')
      .send({ email, role: 'ESTIMATOR' });
    const token = created.body.acceptUrl.split('/').pop();
    await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send({ email, password: 'AcceptPass-1', firstName: 'F', lastName: 'L' })
      .expect(201);

    const second = await request(app)
      .post(`/api/invitations/${token}/accept`)
      .send({ email, password: 'AcceptPass-2', firstName: 'F2', lastName: 'L2' });
    expect(second.status).toBe(410);
  });
});
