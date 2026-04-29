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
    companyName: `Sources-${counter}-${RUN_ID}`,
    email: `sources-${counter}-${RUN_ID}@example.test`,
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
  const email = `m-${counter}-${RUN_ID}@example.test`;
  const fresh = await serviceSignup({
    companyName: `M-${counter}-${RUN_ID}`,
    email,
    password: PASSWORD,
    firstName: 'M',
    lastName: 'B',
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
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.sourceInput.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('POST /api/estimates/:id/source-inputs', () => {
  it('drafter can add a TRANSCRIPT source; activity event recorded', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;

    const res = await agent
      .post(`/api/estimates/${estimate.id}/source-inputs`)
      .send({
        type: 'TRANSCRIPT',
        title: 'Site walkthrough — May 1',
        content: 'Customer wants to demo the back wall and add a new partition.',
      });
    expect(res.status).toBe(201);
    expect(res.body.sourceInput.type).toBe('TRANSCRIPT');
    expect(res.body.sourceInput.addedById).toBe(user.id);

    const activity = await prisma.activityEvent.findFirst({
      where: { organizationId: organization.id, eventType: 'SOURCE_INPUT_ADDED' },
    });
    expect(activity).toBeTruthy();
  });

  it('rejects content > 200KB with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;
    const big = 'a'.repeat(200 * 1024 + 1);
    const res = await agent
      .post(`/api/estimates/${estimate.id}/source-inputs`)
      .send({ type: 'MANUAL_TEXT', title: 'Notes', content: big });
    expect(res.status).toBe(400);
  });

  it('rejects empty content with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;
    const res = await agent
      .post(`/api/estimates/${estimate.id}/source-inputs`)
      .send({ type: 'EMAIL', title: 'Note' });
    expect(res.status).toBe(400);
  });

  it('rejects sources when status is SENT (409)', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: 'SENT' },
    });
    const res = await agent
      .post(`/api/estimates/${estimate.id}/source-inputs`)
      .send({ type: 'EMAIL', title: 'Note', content: 'late add' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('cannot_edit_in_current_status');
  });

  it('non-drafter ESTIMATOR (even reviewer) cannot add sources (403)', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const reviewer = await makeMember(organization.id, 'ESTIMATOR');
    const estimate = (
      await agent
        .post('/api/estimates')
        .send({ title: 'X', reviewerId: reviewer.userId })
        .expect(201)
    ).body.estimate;

    const reviewerAgent = await loginAs(reviewer.email);
    const res = await reviewerAgent
      .post(`/api/estimates/${estimate.id}/source-inputs`)
      .send({ type: 'EMAIL', title: 'Note', content: 'I am the reviewer' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/source-inputs/:id', () => {
  it('drafter can soft-delete; activity event recorded', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;
    const created = (
      await agent
        .post(`/api/estimates/${estimate.id}/source-inputs`)
        .send({ type: 'EMAIL', title: 'note', content: 'hello' })
        .expect(201)
    ).body.sourceInput;

    await agent.delete(`/api/source-inputs/${created.id}`).expect(204);
    const event = await prisma.activityEvent.findFirst({
      where: { organizationId: organization.id, eventType: 'SOURCE_INPUT_REMOVED' },
    });
    expect(event).toBeTruthy();
    const remaining = await prisma.sourceInput.findFirst({
      where: { id: created.id, deletedAt: null },
    });
    expect(remaining).toBeNull();
  });
});

describe('POST /api/source-inputs/signed-upload', () => {
  it('returns a signed URL for a valid PDF payload', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;

    const res = await agent.post('/api/source-inputs/signed-upload').send({
      estimateId: estimate.id,
      contentType: 'application/pdf',
      fileSizeBytes: 500_000,
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https?:\/\//);
    expect(res.body.key).toContain(`estimates/${estimate.id}/sources/`);
  });

  it('rejects unsupported MIME with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;
    const res = await agent
      .post('/api/source-inputs/signed-upload')
      .send({ estimateId: estimate.id, contentType: 'text/plain', fileSizeBytes: 100 });
    expect(res.status).toBe(400);
  });
});
