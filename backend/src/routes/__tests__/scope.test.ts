/**
 * Integration tests for scope sections + line items (Phase 2.11).
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
    companyName: `Scope-${counter}-${RUN_ID}`,
    email: `scope-${counter}-${RUN_ID}@example.test`,
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
  await prisma.user.update({
    where: { id: fresh.user.id },
    data: { organizationId: orgId, role },
  });
  return { email, userId: fresh.user.id };
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.lineItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.scopeSection.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBookEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBookCategory.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBook.deleteMany({ where: { organizationId: orgId } });
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

async function makeEstimateWithSection(agent: ReturnType<typeof request.agent>) {
  const estimate = (
    await agent.post('/api/estimates').send({ title: 'Test Estimate' }).expect(201)
  ).body.estimate;
  const section = (
    await agent
      .post(`/api/estimates/${estimate.id}/scope-sections`)
      .send({ name: 'Demolition' })
      .expect(201)
  ).body.section;
  return { estimate, section };
}

// ─── Sections ──────────────────────────────────────────────────────────────

describe('Scope sections CRUD', () => {
  it('creates with auto-incrementing order, patches, and cascade-soft-deletes line items', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;

    const a = (
      await agent
        .post(`/api/estimates/${estimate.id}/scope-sections`)
        .send({ name: 'Demolition' })
        .expect(201)
    ).body.section;
    expect(a.order).toBe(0);
    const b = (
      await agent
        .post(`/api/estimates/${estimate.id}/scope-sections`)
        .send({ name: 'Framing' })
        .expect(201)
    ).body.section;
    expect(b.order).toBe(1);

    const renamed = (
      await agent.patch(`/api/scope-sections/${a.id}`).send({ name: 'Demo' }).expect(200)
    ).body.section;
    expect(renamed.name).toBe('Demo');

    // Drop a line item under section A and confirm cascade.
    await agent
      .post(`/api/scope-sections/${a.id}/line-items`)
      .send({ description: 'Demo gypsum', unitOfMeasure: 'SF', quantity: '10' })
      .expect(201);
    await agent.delete(`/api/scope-sections/${a.id}`).expect(204);
    const items = await prisma.lineItem.findMany({
      where: { scopeSectionId: a.id, deletedAt: null },
    });
    expect(items).toHaveLength(0);
  });

  it('rejects writes when estimate is SENT (409 cannot_edit_in_current_status)', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'Sent' }).expect(201)
    ).body.estimate;
    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: 'SENT' },
    });
    const res = await agent
      .post(`/api/estimates/${estimate.id}/scope-sections`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('cannot_edit_in_current_status');
  });

  it('rejects ESTIMATOR who is neither drafter nor reviewer', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const estimate = (
      await agent.post('/api/estimates').send({ title: 'X' }).expect(201)
    ).body.estimate;

    const stranger = await makeMember(organization.id, 'ESTIMATOR');
    const strangerAgent = await loginAs(stranger.email);
    const res = await strangerAgent
      .post(`/api/estimates/${estimate.id}/scope-sections`)
      .send({ name: 'Sneaky' });
    expect(res.status).toBe(403);
  });
});

// ─── Line items + totals + markup + usage ─────────────────────────────────

describe('Line items CRUD + math', () => {
  it('creates with org-default markup cascade; recomputes totals on every change', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const { estimate, section } = await makeEstimateWithSection(agent);

    const a = (
      await agent
        .post(`/api/scope-sections/${section.id}/line-items`)
        .send({
          description: 'Demo gypsum',
          unitOfMeasure: 'SF',
          quantity: '10',
          unitCostMaterial: '0.50',
          unitCostLabor: '2.00',
        })
        .expect(201)
    ).body.lineItem;

    // 10 × (0.50 + 2.00) = 25 cost; with org default 0.20 markup → sell 30.
    expect(String(a.lineCost)).toBe('25');
    expect(String(a.lineSellPrice)).toBe('30');
    expect(String(a.markupPercent)).toBe('0.2');

    let est = await prisma.estimate.findUnique({ where: { id: estimate.id } });
    expect(String(est?.totalCost)).toBe('25');
    expect(String(est?.totalSellPrice)).toBe('30');
    expect(String(est?.totalMarkup)).toBe('5');

    const b = (
      await agent
        .post(`/api/scope-sections/${section.id}/line-items`)
        .send({
          description: 'Demo wall sub',
          unitOfMeasure: 'EA',
          quantity: '2',
          unitCostMaterial: '100',
          unitCostLabor: '50',
          markupPercent: '0.10',
        })
        .expect(201)
    ).body.lineItem;
    expect(String(b.lineCost)).toBe('300');
    expect(String(b.lineSellPrice)).toBe('330');

    est = await prisma.estimate.findUnique({ where: { id: estimate.id } });
    expect(String(est?.totalCost)).toBe('325');
    expect(String(est?.totalSellPrice)).toBe('360');

    // Patch quantity → recompute and totals follow.
    const updated = (
      await agent.patch(`/api/line-items/${a.id}`).send({ quantity: '20' }).expect(200)
    ).body.lineItem;
    expect(String(updated.lineCost)).toBe('50');

    est = await prisma.estimate.findUnique({ where: { id: estimate.id } });
    expect(String(est?.totalCost)).toBe('350');

    // Soft delete b; totals reflect.
    await agent.delete(`/api/line-items/${b.id}`).expect(204);
    est = await prisma.estimate.findUnique({ where: { id: estimate.id } });
    expect(String(est?.totalCost)).toBe('50');
    expect(String(est?.totalSellPrice)).toBe('60');
  });

  it('bumps PriceBookEntry usageCount + lastUsedAt on creation', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const { section } = await makeEstimateWithSection(agent);

    const book = (
      await agent.post('/api/price-books').send({ name: 'B', isDefault: true }).expect(201)
    ).body.priceBook;
    const cat = (
      await agent
        .post(`/api/price-books/${book.id}/categories`)
        .send({ name: 'Drywall' })
        .expect(201)
    ).body.category;
    const entry = (
      await agent
        .post(`/api/price-books/${book.id}/entries`)
        .send({
          categoryId: cat.id,
          description: 'Type X 5/8',
          unitOfMeasure: 'SF',
          unitCostMaterial: '1.00',
          unitCostLabor: '2.00',
        })
        .expect(201)
    ).body.entry;
    expect(entry.usageCount).toBe(0);

    await agent
      .post(`/api/scope-sections/${section.id}/line-items`)
      .send({
        description: 'Type X 5/8 — partition',
        unitOfMeasure: 'SF',
        quantity: '100',
        priceBookEntryId: entry.id,
      })
      .expect(201);

    const fresh = await prisma.priceBookEntry.findUnique({ where: { id: entry.id } });
    expect(fresh?.usageCount).toBe(1);
    expect(fresh?.lastUsedAt).not.toBeNull();
  });

  it('bulk delete soft-deletes selected line items and recomputes totals', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const { estimate, section } = await makeEstimateWithSection(agent);

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const li = (
        await agent
          .post(`/api/scope-sections/${section.id}/line-items`)
          .send({
            description: `Item ${i}`,
            unitOfMeasure: 'EA',
            quantity: '1',
            unitCostMaterial: '10',
            unitCostLabor: '0',
          })
          .expect(201)
      ).body.lineItem;
      ids.push(li.id);
    }

    let est = await prisma.estimate.findUnique({ where: { id: estimate.id } });
    expect(String(est?.totalCost)).toBe('30');

    const res = await agent
      .post('/api/line-items/bulk')
      .send({ operation: 'delete', lineItemIds: ids.slice(0, 2) })
      .expect(200);
    expect(res.body.count).toBe(2);

    est = await prisma.estimate.findUnique({ where: { id: estimate.id } });
    expect(String(est?.totalCost)).toBe('10');
  });

  it('bulk applyMarkup updates lineSellPrice on every targeted line', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const { section } = await makeEstimateWithSection(agent);

    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const li = (
        await agent
          .post(`/api/scope-sections/${section.id}/line-items`)
          .send({
            description: `Item ${i}`,
            unitOfMeasure: 'EA',
            quantity: '1',
            unitCostMaterial: '100',
            unitCostLabor: '0',
          })
          .expect(201)
      ).body.lineItem;
      ids.push(li.id);
    }

    await agent
      .post('/api/line-items/bulk')
      .send({ operation: 'applyMarkup', lineItemIds: ids, payload: { markupPercent: '0.50' } })
      .expect(200);

    const fresh = await prisma.lineItem.findMany({ where: { id: { in: ids } } });
    for (const li of fresh) {
      expect(String(li.markupPercent)).toBe('0.5');
      expect(String(li.lineSellPrice)).toBe('150');
    }
  });

  it('rejects bulk over 500 ids with 400', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    await makeEstimateWithSection(agent);
    const ids = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    const res = await agent
      .post('/api/line-items/bulk')
      .send({ operation: 'delete', lineItemIds: ids });
    expect(res.status).toBe(400);
  });

  it('rejects updates when estimate is SENT (409)', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const { estimate, section } = await makeEstimateWithSection(agent);
    const li = (
      await agent
        .post(`/api/scope-sections/${section.id}/line-items`)
        .send({ description: 'Li', unitOfMeasure: 'EA' })
        .expect(201)
    ).body.lineItem;

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: 'SENT' },
    });
    const patch = await agent
      .patch(`/api/line-items/${li.id}`)
      .send({ quantity: '5' });
    expect(patch.status).toBe(409);
  });

  it('IN_REVIEW allows the assigned reviewer to edit a line item', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const reviewer = await makeMember(organization.id, 'ESTIMATOR');

    const estimate = (
      await agent
        .post('/api/estimates')
        .send({ title: 'Review me', reviewerId: reviewer.userId })
        .expect(201)
    ).body.estimate;
    const section = (
      await agent
        .post(`/api/estimates/${estimate.id}/scope-sections`)
        .send({ name: 'Demolition' })
        .expect(201)
    ).body.section;
    const li = (
      await agent
        .post(`/api/scope-sections/${section.id}/line-items`)
        .send({ description: 'Demo', unitOfMeasure: 'SF', quantity: '1' })
        .expect(201)
    ).body.lineItem;

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: 'IN_REVIEW' },
    });

    const reviewerAgent = await loginAs(reviewer.email);
    const res = await reviewerAgent
      .patch(`/api/line-items/${li.id}`)
      .send({ unitCostMaterial: '5' });
    expect(res.status).toBe(200);
  });
});
