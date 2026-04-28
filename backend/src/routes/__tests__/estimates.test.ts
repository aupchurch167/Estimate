/**
 * Integration tests for /api/estimates (Phase 2.8).
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
    companyName: `EstTests-${counter}-${RUN_ID}`,
    email: `est-${counter}-${RUN_ID}@example.test`,
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

async function makeMember(orgId: string, role: 'PM' | 'VIEWER' | 'ESTIMATOR' | 'ADMIN') {
  counter += 1;
  const email = `member-${counter}-${RUN_ID}@example.test`;
  const fresh = await serviceSignup({
    companyName: `Member-${counter}-${RUN_ID}`,
    email,
    password: PASSWORD,
    firstName: 'M',
    lastName: 'B',
  });
  orgIds.add(fresh.organization.id);
  const moved = await prisma.user.update({
    where: { id: fresh.user.id },
    data: { organizationId: orgId, role },
  });
  return { email, userId: moved.id };
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('POST /api/estimates', () => {
  it('creates a DRAFT estimate, auto-numbers, writes activity', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0');

    const a = await agent
      .post('/api/estimates')
      .send({ title: 'Acme TI', clientCompanyName: 'Acme Corp' })
      .expect(201);
    expect(a.body.estimate.status).toBe('DRAFT');
    expect(a.body.estimate.drafterId).toBe(user.id);
    expect(a.body.estimate.number).toMatch(new RegExp(`^[A-Z]{2,5}-${yy}-001$`));

    const b = await agent
      .post('/api/estimates')
      .send({ title: 'Beta Warehouse', clientCompanyName: 'Beta LLC' })
      .expect(201);
    expect(b.body.estimate.number).toMatch(new RegExp(`^[A-Z]{2,5}-${yy}-002$`));

    const events = await prisma.activityEvent.findMany({
      where: { organizationId: organization.id, eventType: 'ESTIMATE_CREATED' },
    });
    expect(events).toHaveLength(2);
  });

  it('returns 403 when role cannot create (PM)', async () => {
    const { organization, user } = await makeOwner();
    void user;
    const member = await makeMember(organization.id, 'PM');
    const agent = await loginAs(member.email);
    const res = await agent.post('/api/estimates').send({ title: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when reviewerId points to a non-member', async () => {
    const { user } = await makeOwner();
    const stranger = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent
      .post('/api/estimates')
      .send({ title: 'Bad reviewer', reviewerId: stranger.user.id });
    expect(res.status).toBe(400);
  });

  it('two concurrent creates produce distinct sequential numbers', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const [a, b] = await Promise.all([
      agent.post('/api/estimates').send({ title: 'Concurrent A' }),
      agent.post('/api/estimates').send({ title: 'Concurrent B' }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.estimate.number).not.toBe(b.body.estimate.number);
  });
});

describe('GET /api/estimates', () => {
  it('lists with status + drafter filters and supports search by title', async () => {
    const { user, organization } = await makeOwner();
    void organization;
    const agent = await loginAs(user.email);
    await agent.post('/api/estimates').send({ title: 'Acme TI', clientCompanyName: 'Acme' }).expect(201);
    await agent.post('/api/estimates').send({ title: 'Beta Warehouse' }).expect(201);

    const all = await agent.get('/api/estimates').expect(200);
    expect(all.body.total).toBeGreaterThanOrEqual(2);

    const search = await agent.get('/api/estimates?search=acme').expect(200);
    const titles = search.body.data.map((e: { title: string }) => e.title);
    expect(titles).toContain('Acme TI');

    const drafterFiltered = await agent
      .get(`/api/estimates?drafterId=${user.id}`)
      .expect(200);
    expect(drafterFiltered.body.total).toBeGreaterThanOrEqual(2);

    const draftStatus = await agent.get('/api/estimates?status=DRAFT').expect(200);
    for (const e of draftStatus.body.data) {
      expect(e.status).toBe('DRAFT');
    }
  });
});

describe('GET /api/estimates/:id', () => {
  it('returns estimate with empty nested collections', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = (await agent.post('/api/estimates').send({ title: 'X' }).expect(201)).body
      .estimate;

    const res = await agent.get(`/api/estimates/${created.id}`).expect(200);
    expect(res.body.estimate.id).toBe(created.id);
    expect(res.body.estimate.scopeSections).toEqual([]);
    expect(res.body.estimate.lineItems).toEqual([]);
    expect(res.body.estimate.sourceInputs).toEqual([]);
    expect(res.body.estimate.conversation).toBeNull();
  });

  it('returns 404 for unknown id', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const res = await agent.get('/api/estimates/no-such-id');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/estimates/:id', () => {
  it('drafter can edit their DRAFT estimate', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = (
      await agent.post('/api/estimates').send({ title: 'Old title' }).expect(201)
    ).body.estimate;
    const res = await agent
      .patch(`/api/estimates/${created.id}`)
      .send({ title: 'New title', clientContactEmail: 'someone@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.estimate.title).toBe('New title');
    expect(res.body.estimate.clientContactEmail).toBe('someone@example.com');
  });

  it('returns 409 cannot_edit_in_current_status when status is SENT', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = (
      await agent.post('/api/estimates').send({ title: 'Locked' }).expect(201)
    ).body.estimate;
    // Force SENT status directly (real flow does this via 4.1).
    await prisma.estimate.update({
      where: { id: created.id },
      data: { status: 'SENT' },
    });
    const res = await agent
      .patch(`/api/estimates/${created.id}`)
      .send({ title: 'Hacked' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('cannot_edit_in_current_status');
  });

  it('rejects ESTIMATOR who is neither drafter nor reviewer with 403', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = (
      await agent.post('/api/estimates').send({ title: 'Theirs' }).expect(201)
    ).body.estimate;

    const stranger = await makeMember(organization.id, 'ESTIMATOR');
    const strangerAgent = await loginAs(stranger.email);
    const res = await strangerAgent
      .patch(`/api/estimates/${created.id}`)
      .send({ title: 'Mine now' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/estimates/:id', () => {
  it('OWNER can soft-delete any draft', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const created = (
      await agent.post('/api/estimates').send({ title: 'Goodbye' }).expect(201)
    ).body.estimate;
    await agent.delete(`/api/estimates/${created.id}`).expect(204);
    const res = await agent.get(`/api/estimates/${created.id}`);
    expect(res.status).toBe(404);
  });

  it('ESTIMATOR cannot delete another user’s draft (403)', async () => {
    const { user, organization } = await makeOwner();
    const ownerAgent = await loginAs(user.email);
    const ownerEst = (
      await ownerAgent.post('/api/estimates').send({ title: 'Owner draft' }).expect(201)
    ).body.estimate;

    const est = await makeMember(organization.id, 'ESTIMATOR');
    const estAgent = await loginAs(est.email);
    const res = await estAgent.delete(`/api/estimates/${ownerEst.id}`);
    expect(res.status).toBe(403);
  });

  it('ESTIMATOR can delete their own DRAFT (and only DRAFT)', async () => {
    const { user, organization } = await makeOwner();
    const est = await makeMember(organization.id, 'ESTIMATOR');
    const estAgent = await loginAs(est.email);
    const own = (
      await estAgent.post('/api/estimates').send({ title: 'My draft' }).expect(201)
    ).body.estimate;
    void user;

    // Force into IN_REVIEW — ESTIMATOR can no longer delete.
    await prisma.estimate.update({
      where: { id: own.id },
      data: { status: 'IN_REVIEW' },
    });
    const reject = await estAgent.delete(`/api/estimates/${own.id}`);
    expect(reject.status).toBe(403);

    // Back to DRAFT — now allowed.
    await prisma.estimate.update({
      where: { id: own.id },
      data: { status: 'DRAFT' },
    });
    await estAgent.delete(`/api/estimates/${own.id}`).expect(204);
  });
});
