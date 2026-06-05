import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';

const app = createApp();
const RUN_ID = `bid${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PASSWORD = 'BidTest1!';
let counter = 0;
const orgIds = new Set<string>();

async function makeOwner() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `BidTests-${counter}-${RUN_ID}`,
    email: `bid-${counter}-${RUN_ID}@example.test`,
    password: PASSWORD,
    firstName: 'Bid',
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

async function makeMember(orgId: string, role: 'PM' | 'VIEWER' | 'ESTIMATOR' | 'ADMIN') {
  counter += 1;
  const email = `bidmem-${counter}-${RUN_ID}@example.test`;
  const fresh = await serviceSignup({
    companyName: `BidMem-${counter}-${RUN_ID}`,
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

async function createEstimate(agent: ReturnType<typeof request.agent>, title = 'Test Estimate') {
  const res = await agent.post('/api/estimates').send({ title }).expect(201);
  return res.body.estimate;
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.bidReminder.deleteMany({ where: { organizationId: orgId } });
    await prisma.bidDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.bidResponseAttachment.deleteMany({ where: { bidResponse: { organizationId: orgId } } });
    await prisma.bidResponseLineItem.deleteMany({ where: { bidResponse: { organizationId: orgId } } });
    await prisma.bidResponse.deleteMany({ where: { organizationId: orgId } });
    await prisma.bidRequest.deleteMany({ where: { organizationId: orgId } });
    await prisma.bidPackage.deleteMany({ where: { organizationId: orgId } });
    await prisma.lineItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.scopeSection.deleteMany({ where: { organizationId: orgId } });
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.reviewAction.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateExport.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateSnapshot.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ─── Bid Package CRUD ───────────────────────────────────────────────────────

describe('POST /api/bid-packages', () => {
  it('creates a DRAFT bid package', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);

    const res = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Electrical Rough-In' })
      .expect(201);

    expect(res.body.status).toBe('DRAFT');
    expect(res.body.title).toBe('Electrical Rough-In');
    expect(res.body.estimateId).toBe(estimate.id);
    expect(res.body.createdById).toBe(user.id);
  });

  it('returns 400 for missing title', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);

    await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id })
      .expect(400);
  });

  it('returns 404 for non-existent estimate', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);

    await agent
      .post('/api/bid-packages')
      .send({ estimateId: 'nonexistent-id', title: 'Bad Ref' })
      .expect(404);
  });

  it('returns 403 for VIEWER role', async () => {
    const { organization, user } = await makeOwner();
    void user;
    const viewer = await makeMember(organization.id, 'VIEWER');
    const agent = await loginAs(viewer.email);

    await agent
      .post('/api/bid-packages')
      .send({ estimateId: 'any', title: 'Nope' })
      .expect(403);
  });
});

describe('GET /api/bid-packages', () => {
  it('lists bid packages for the org', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);

    await agent.post('/api/bid-packages').send({ estimateId: estimate.id, title: 'Pkg A' }).expect(201);
    await agent.post('/api/bid-packages').send({ estimateId: estimate.id, title: 'Pkg B' }).expect(201);

    const res = await agent.get('/api/bid-packages').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by estimateId', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estA = await createEstimate(agent, 'Est A');
    const estB = await createEstimate(agent, 'Est B');

    await agent.post('/api/bid-packages').send({ estimateId: estA.id, title: 'For A' }).expect(201);
    await agent.post('/api/bid-packages').send({ estimateId: estB.id, title: 'For B' }).expect(201);

    const res = await agent.get(`/api/bid-packages?estimateId=${estA.id}`).expect(200);
    expect(res.body.every((p: { estimateId: string }) => p.estimateId === estA.id)).toBe(true);
  });
});

describe('GET /api/bid-packages/:id', () => {
  it('returns a single bid package with includes', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);

    const created = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Detail Test' })
      .expect(201);

    const res = await agent.get(`/api/bid-packages/${created.body.id}`).expect(200);
    expect(res.body.title).toBe('Detail Test');
    expect(res.body.createdBy).toBeDefined();
    expect(res.body.estimate).toBeDefined();
  });

  it('returns 404 for wrong org', async () => {
    const ownerA = await makeOwner();
    const agentA = await loginAs(ownerA.user.email);
    const estimateA = await createEstimate(agentA);
    const pkgA = await agentA
      .post('/api/bid-packages')
      .send({ estimateId: estimateA.id, title: 'OrgA Pkg' })
      .expect(201);

    const ownerB = await makeOwner();
    const agentB = await loginAs(ownerB.user.email);

    await agentB.get(`/api/bid-packages/${pkgA.body.id}`).expect(404);
  });
});

describe('PATCH /api/bid-packages/:id', () => {
  it('updates a DRAFT package', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Original' })
      .expect(201);

    const res = await agent
      .patch(`/api/bid-packages/${pkg.body.id}`)
      .send({ title: 'Updated', description: 'New desc' })
      .expect(200);

    expect(res.body.title).toBe('Updated');
    expect(res.body.description).toBe('New desc');
  });
});

describe('DELETE /api/bid-packages/:id', () => {
  it('deletes a DRAFT package', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Delete Me' })
      .expect(201);

    await agent.delete(`/api/bid-packages/${pkg.body.id}`).expect(204);
    await agent.get(`/api/bid-packages/${pkg.body.id}`).expect(404);
  });
});

// ─── Bid Requests ───────────────────────────────────────────────────────────

describe('Bid Requests (vendors on a package)', () => {
  it('adds, lists, and removes a vendor request', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Vendor Test' })
      .expect(201);
    const pkgId = pkg.body.id;

    const addRes = await agent
      .post(`/api/bid-packages/${pkgId}/requests`)
      .send({ vendorName: 'Apex Electric', vendorEmail: 'apex@example.test' })
      .expect(201);
    expect(addRes.body.vendorName).toBe('Apex Electric');
    expect(addRes.body.accessToken).toBeDefined();
    const reqId = addRes.body.id;

    const listRes = await agent.get(`/api/bid-packages/${pkgId}/requests`).expect(200);
    expect(listRes.body).toHaveLength(1);

    await agent.delete(`/api/bid-packages/${pkgId}/requests/${reqId}`).expect(204);
    const afterDelete = await agent.get(`/api/bid-packages/${pkgId}/requests`).expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────

describe('Bid Package Lifecycle', () => {
  it('DRAFT → publish (requires vendors) → close', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Lifecycle Test' })
      .expect(201);
    const pkgId = pkg.body.id;

    // Cannot publish without vendors
    await agent.post(`/api/bid-packages/${pkgId}/publish`).expect(400);

    // Add a vendor
    await agent
      .post(`/api/bid-packages/${pkgId}/requests`)
      .send({ vendorName: 'Vendor A', vendorEmail: 'va@example.test' })
      .expect(201);

    // Publish
    const pubRes = await agent.post(`/api/bid-packages/${pkgId}/publish`).expect(200);
    expect(pubRes.body.status).toBe('PUBLISHED');
    expect(pubRes.body.publishedAt).toBeDefined();

    // Cannot publish again
    await agent.post(`/api/bid-packages/${pkgId}/publish`).expect(400);

    // Cannot edit after publish
    await agent.patch(`/api/bid-packages/${pkgId}`).send({ title: 'Nope' }).expect(400);

    // Cannot delete after publish
    await agent.delete(`/api/bid-packages/${pkgId}`).expect(400);

    // Close
    const closeRes = await agent.post(`/api/bid-packages/${pkgId}/close`).expect(200);
    expect(closeRes.body.status).toBe('CLOSED');
  });

  it('cancel works from any non-cancelled state', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Cancel Test' })
      .expect(201);

    const cancelRes = await agent.post(`/api/bid-packages/${pkg.body.id}/cancel`).expect(200);
    expect(cancelRes.body.status).toBe('CANCELLED');

    // Cannot cancel again
    await agent.post(`/api/bid-packages/${pkg.body.id}/cancel`).expect(400);
  });
});

// ─── Public Portal ──────────────────────────────────────────────────────────

describe('Public Bid Portal', () => {
  it('retrieves bid request via access token and marks as viewed', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Portal Test' })
      .expect(201);
    const pkgId = pkg.body.id;

    const addRes = await agent
      .post(`/api/bid-packages/${pkgId}/requests`)
      .send({ vendorName: 'Portal Vendor', vendorEmail: 'portal@example.test' })
      .expect(201);
    const token = addRes.body.accessToken;

    // Publish so the request becomes SENT
    const pubRes = await agent.post(`/api/bid-packages/${pkgId}/publish`).expect(200);
    const sentReq = pubRes.body.bidRequests.find(
      (r: { vendorEmail: string }) => r.vendorEmail === 'portal@example.test',
    );
    expect(sentReq.status).toBe('SENT');

    // Portal access — no auth needed
    const portalRes = await request(app).get(`/api/portal/bid/${token}`).expect(200);
    expect(portalRes.body.request.vendorName).toBe('Portal Vendor');
    expect(portalRes.body.bidPackage).toBeDefined();
    expect(portalRes.body.organization).toBeDefined();

    // Check it was marked viewed
    const req2 = await prisma.bidRequest.findUnique({ where: { accessToken: token } });
    expect(req2!.status).toBe('VIEWED');
    expect(req2!.viewedAt).not.toBeNull();
  });

  it('returns 404 for invalid token', async () => {
    await request(app).get('/api/portal/bid/bogus-token').expect(404);
  });
});

// ─── Bid Responses ──────────────────────────────────────────────────────────

describe('Bid Responses', () => {
  async function publishedPackageWithVendor() {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Response Test' })
      .expect(201);
    const pkgId = pkg.body.id;

    const addRes = await agent
      .post(`/api/bid-packages/${pkgId}/requests`)
      .send({ vendorName: 'Sub Co', vendorEmail: 'sub@example.test' })
      .expect(201);
    const bidRequestId = addRes.body.id;
    const accessToken = addRes.body.accessToken;

    await agent.post(`/api/bid-packages/${pkgId}/publish`).expect(200);

    return { agent, pkgId, bidRequestId, accessToken, estimate, user };
  }

  it('submits a bid response via portal', async () => {
    const { accessToken, pkgId, agent } = await publishedPackageWithVendor();

    // Mark as viewed first
    await request(app).get(`/api/portal/bid/${accessToken}`).expect(200);

    // Submit via portal
    const submitRes = await request(app)
      .post(`/api/portal/bid/${accessToken}/respond`)
      .send({
        totalAmount: 45000,
        notes: 'Includes all materials',
        lineItems: [
          { description: 'Panel install', quantity: 4, unitPrice: 5000, totalPrice: 20000 },
          { description: 'Wiring', quantity: 1, unitPrice: 25000, totalPrice: 25000 },
        ],
      })
      .expect(201);

    expect(submitRes.body.totalAmount).toBe('45000');
    expect(submitRes.body.lineItems).toHaveLength(2);
    expect(submitRes.body.submissionSource).toBe('PORTAL');

    // List responses for the package
    const listRes = await agent.get(`/api/bids/packages/${pkgId}/responses`).expect(200);
    expect(listRes.body).toHaveLength(1);
  });

  it('submits a manual bid response', async () => {
    const { agent, bidRequestId } = await publishedPackageWithVendor();

    const res = await agent
      .post('/api/bids/responses')
      .send({ bidRequestId, totalAmount: 30000, submissionSource: 'MANUAL' })
      .expect(201);

    expect(res.body.submissionSource).toBe('MANUAL');
  });

  it('rejects duplicate response', async () => {
    const { accessToken } = await publishedPackageWithVendor();

    await request(app)
      .post(`/api/portal/bid/${accessToken}/respond`)
      .send({ totalAmount: 10000 })
      .expect(201);

    await request(app)
      .post(`/api/portal/bid/${accessToken}/respond`)
      .send({ totalAmount: 20000 })
      .expect(400);
  });
});

// ─── Bid Documents ──────────────────────────────────────────────────────────

describe('Bid Documents', () => {
  it('adds and removes scope documents from a package', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Doc Test' })
      .expect(201);
    const pkgId = pkg.body.id;

    const addRes = await agent
      .post(`/api/bids/packages/${pkgId}/documents`)
      .send({ fileName: 'plans.pdf', fileUrl: 'https://example.com/plans.pdf' })
      .expect(201);
    expect(addRes.body.fileName).toBe('plans.pdf');

    const listRes = await agent.get(`/api/bids/packages/${pkgId}/documents`).expect(200);
    expect(listRes.body).toHaveLength(1);

    await agent.delete(`/api/bids/documents/${addRes.body.id}`).expect(204);
    const afterDel = await agent.get(`/api/bids/packages/${pkgId}/documents`).expect(200);
    expect(afterDel.body).toHaveLength(0);
  });
});

// ─── Award & Reconcile ──────────────────────────────────────────────────────

describe('Bid Award & Reconcile', () => {
  it('awards a bid, closes the package, declines others', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);
    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Award Test' })
      .expect(201);
    const pkgId = pkg.body.id;

    const v1 = await agent
      .post(`/api/bid-packages/${pkgId}/requests`)
      .send({ vendorName: 'Winner', vendorEmail: 'winner@example.test' })
      .expect(201);
    const v2 = await agent
      .post(`/api/bid-packages/${pkgId}/requests`)
      .send({ vendorName: 'Loser', vendorEmail: 'loser@example.test' })
      .expect(201);

    await agent.post(`/api/bid-packages/${pkgId}/publish`).expect(200);

    // Submit responses for both
    await request(app)
      .post(`/api/portal/bid/${v1.body.accessToken}/respond`)
      .send({ totalAmount: 25000 })
      .expect(201);
    await request(app)
      .post(`/api/portal/bid/${v2.body.accessToken}/respond`)
      .send({ totalAmount: 35000 })
      .expect(201);

    // Award to v1
    const awardRes = await agent
      .post('/api/bids/award')
      .send({ bidRequestId: v1.body.id })
      .expect(200);
    expect(awardRes.body.awardedRequestId).toBe(v1.body.id);

    // Package should be CLOSED
    const pkgRes = await agent.get(`/api/bid-packages/${pkgId}`).expect(200);
    expect(pkgRes.body.status).toBe('CLOSED');

    // Loser should be DECLINED
    const loser = await prisma.bidRequest.findUnique({ where: { id: v2.body.id } });
    expect(loser!.status).toBe('DECLINED');
  });

  it('reconciles bid response line items into an estimate', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = await createEstimate(agent);

    // Create a scope section
    const sectionRes = await agent
      .post(`/api/estimates/${estimate.id}/scope-sections`)
      .send({ name: 'Electrical' })
      .expect(201);
    const sectionId = sectionRes.body.section.id;

    const pkg = await agent
      .post('/api/bid-packages')
      .send({ estimateId: estimate.id, title: 'Reconcile Test' })
      .expect(201);
    const pkgId = pkg.body.id;

    const vendor = await agent
      .post(`/api/bid-packages/${pkgId}/requests`)
      .send({ vendorName: 'Reconcile Vendor', vendorEmail: 'recon@example.test' })
      .expect(201);

    await agent.post(`/api/bid-packages/${pkgId}/publish`).expect(200);

    // Submit response with line items
    const submitRes = await request(app)
      .post(`/api/portal/bid/${vendor.body.accessToken}/respond`)
      .send({
        totalAmount: 15000,
        lineItems: [
          { description: 'Conduit run', quantity: 100, unit: 'LF', unitPrice: 50, totalPrice: 5000 },
          { description: 'Panel hookup', quantity: 1, unitPrice: 10000, totalPrice: 10000 },
        ],
      })
      .expect(201);

    const responseId = submitRes.body.id;

    // Reconcile
    const reconRes = await agent
      .post('/api/bids/reconcile')
      .send({ bidResponseId: responseId, estimateId: estimate.id, scopeSectionId: sectionId })
      .expect(200);

    expect(reconRes.body.lineItemsCreated).toBe(2);
    expect(reconRes.body.lineItems[0].source).toBe('BID_RESPONSE');
    expect(reconRes.body.lineItems[0].status).toBe('NEEDS_REVIEW');
  });
});
