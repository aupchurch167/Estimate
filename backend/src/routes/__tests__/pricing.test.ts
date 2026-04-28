/**
 * Integration tests for pricing endpoints (Phase 2.5).
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
    companyName: `Pricing Tests ${counter} ${RUN_ID}`,
    email: `pricing-${counter}-${RUN_ID}@example.test`,
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

async function makeNonAdmin(orgId: string, role: 'PM' | 'VIEWER' | 'ESTIMATOR') {
  counter += 1;
  const email = `nonadmin-${counter}-${RUN_ID}@example.test`;
  const fresh = await serviceSignup({
    companyName: `Member Source ${counter} ${RUN_ID}`,
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
  return email;
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.priceBookEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBookCategory.deleteMany({ where: { organizationId: orgId } });
    await prisma.markupRule.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBook.deleteMany({ where: { organizationId: orgId } });
    await prisma.invitation.deleteMany({ where: { organizationId: orgId } });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ─── PriceBook ─────────────────────────────────────────────────────────────

describe('Price book CRUD', () => {
  it('OWNER lists / creates / patches / deletes; default flips atomically', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);

    const initial = await agent.get('/api/price-books').expect(200);
    expect(initial.body.priceBooks).toEqual([]);

    const a = await agent
      .post('/api/price-books')
      .send({ name: 'Catalog A', isDefault: true })
      .expect(201);
    expect(a.body.priceBook.isDefault).toBe(true);

    const b = await agent
      .post('/api/price-books')
      .send({ name: 'Catalog B', isDefault: true })
      .expect(201);
    expect(b.body.priceBook.isDefault).toBe(true);

    const list = await agent.get('/api/price-books').expect(200);
    const aFresh = list.body.priceBooks.find((p: { id: string }) => p.id === a.body.priceBook.id);
    expect(aFresh.isDefault).toBe(false); // flipped
    const defaults = list.body.priceBooks.filter((p: { isDefault: boolean }) => p.isDefault);
    expect(defaults).toHaveLength(1);

    const patched = await agent
      .patch(`/api/price-books/${a.body.priceBook.id}`)
      .send({ name: 'Catalog A — renamed' })
      .expect(200);
    expect(patched.body.priceBook.name).toBe('Catalog A — renamed');

    // Cannot delete the default book.
    const reject = await agent.delete(`/api/price-books/${b.body.priceBook.id}`).expect(409);
    expect(reject.body.error.code).toBe('cannot_delete_default_pricebook');

    // Promote A to default, then delete B.
    await agent.patch(`/api/price-books/${a.body.priceBook.id}`).send({ isDefault: true }).expect(200);
    await agent.delete(`/api/price-books/${b.body.priceBook.id}`).expect(204);
  });

  it('returns 401 unauthenticated', async () => {
    const res = await request(app).get('/api/price-books');
    expect(res.status).toBe(401);
  });

  it('returns 403 on writes when ESTIMATOR', async () => {
    const { user, organization } = await makeOwner();
    void user;
    const memberEmail = await makeNonAdmin(organization.id, 'ESTIMATOR');
    const agent = await loginAs(memberEmail);
    const res = await agent.post('/api/price-books').send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });
});

// ─── Category ──────────────────────────────────────────────────────────────

describe('Category CRUD + delete-with-entries gating', () => {
  it('lists, creates, updates, deletes (with entry-count protection)', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const book = (await agent.post('/api/price-books').send({ name: 'Catalog' }).expect(201)).body
      .priceBook;

    const cat = (
      await agent
        .post(`/api/price-books/${book.id}/categories`)
        .send({ name: 'Demolition', defaultMarkupPercent: '0.20' })
        .expect(201)
    ).body.category;

    expect(cat.name).toBe('Demolition');
    expect(cat.priceBookId).toBe(book.id);
    expect(cat.order).toBe(0);

    const cat2 = (
      await agent
        .post(`/api/price-books/${book.id}/categories`)
        .send({ name: 'Framing' })
        .expect(201)
    ).body.category;
    expect(cat2.order).toBe(1);

    const list = await agent.get(`/api/price-books/${book.id}/categories`).expect(200);
    expect(list.body.categories.map((c: { name: string }) => c.name)).toEqual([
      'Demolition',
      'Framing',
    ]);

    const renamed = await agent
      .patch(`/api/categories/${cat.id}`)
      .send({ name: 'Demo' })
      .expect(200);
    expect(renamed.body.category.name).toBe('Demo');

    // Add an entry and confirm the category is protected from naive delete.
    await agent
      .post(`/api/price-books/${book.id}/entries`)
      .send({
        categoryId: cat.id,
        description: 'Demo gypsum partition',
        unitOfMeasure: 'SF',
        unitCostMaterial: '0.50',
        unitCostLabor: '2.00',
        defaultMarkupPercent: '0.20',
      })
      .expect(201);

    const reject = await agent.delete(`/api/categories/${cat.id}`).expect(409);
    expect(reject.body.error.code).toBe('category_has_entries');
    expect(reject.body.error.details.entryCount).toBe(1);

    // ?force=true cascades soft-deletes the entries.
    await agent.delete(`/api/categories/${cat.id}?force=true`).expect(204);

    const after = await agent.get(`/api/price-books/${book.id}/entries`).expect(200);
    expect(after.body.data).toEqual([]);
  });
});

// ─── Entry ─────────────────────────────────────────────────────────────────

describe('Entry CRUD, search, pagination, code-conflict', () => {
  it('creates + lists with pagination; search hits description / code / aiKeywords', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const book = (await agent.post('/api/price-books').send({ name: 'C' }).expect(201)).body
      .priceBook;
    const cat = (
      await agent.post(`/api/price-books/${book.id}/categories`).send({ name: 'Drywall' }).expect(201)
    ).body.category;

    const seedEntries = [
      { code: 'D-100', description: '5/8" Type X gypsum, taped Level 4', aiKeywords: 'drywall sheetrock' },
      { code: null, description: 'Sound batt insulation', aiKeywords: 'acoustic stc' },
      { code: 'D-200', description: 'Plaster patch', aiKeywords: 'patch repair' },
    ];
    for (const e of seedEntries) {
      await agent
        .post(`/api/price-books/${book.id}/entries`)
        .send({
          categoryId: cat.id,
          ...e,
          unitOfMeasure: 'SF',
          unitCostMaterial: '1.00',
          unitCostLabor: '2.00',
        })
        .expect(201);
    }

    const all = await agent.get(`/api/price-books/${book.id}/entries`).expect(200);
    expect(all.body.total).toBe(3);
    expect(all.body.data).toHaveLength(3);

    const search = await agent
      .get(`/api/price-books/${book.id}/entries?search=drywall`)
      .expect(200);
    expect(search.body.total).toBe(1);
    expect(search.body.data[0].code).toBe('D-100');

    const codeSearch = await agent
      .get(`/api/price-books/${book.id}/entries?search=D-2`)
      .expect(200);
    expect(codeSearch.body.total).toBe(1);

    const paged = await agent
      .get(`/api/price-books/${book.id}/entries?limit=2&page=1`)
      .expect(200);
    expect(paged.body.pageSize).toBe(2);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.totalPages).toBe(2);

    const filtered = await agent
      .get(`/api/price-books/${book.id}/entries?category=${cat.id}`)
      .expect(200);
    expect(filtered.body.total).toBe(3);
  });

  it('rejects duplicate code in the same org with 409 code_conflict', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const book = (await agent.post('/api/price-books').send({ name: 'C' }).expect(201)).body
      .priceBook;
    const cat = (
      await agent.post(`/api/price-books/${book.id}/categories`).send({ name: 'X' }).expect(201)
    ).body.category;

    const first = await agent
      .post(`/api/price-books/${book.id}/entries`)
      .send({
        categoryId: cat.id,
        code: 'CODE-1',
        description: 'first',
        unitOfMeasure: 'EA',
      })
      .expect(201);
    expect(first.body.entry.code).toBe('CODE-1');

    const second = await agent
      .post(`/api/price-books/${book.id}/entries`)
      .send({
        categoryId: cat.id,
        code: 'CODE-1',
        description: 'second',
        unitOfMeasure: 'EA',
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('code_conflict');
  });

  it('updates + soft-deletes; deleted entries fall out of list', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const book = (await agent.post('/api/price-books').send({ name: 'C' }).expect(201)).body
      .priceBook;
    const cat = (
      await agent.post(`/api/price-books/${book.id}/categories`).send({ name: 'X' }).expect(201)
    ).body.category;
    const entry = (
      await agent
        .post(`/api/price-books/${book.id}/entries`)
        .send({
          categoryId: cat.id,
          description: 'orig',
          unitOfMeasure: 'EA',
        })
        .expect(201)
    ).body.entry;

    const patched = await agent
      .patch(`/api/entries/${entry.id}`)
      .send({ description: 'updated', defaultMarkupPercent: '0.35' })
      .expect(200);
    expect(patched.body.entry.description).toBe('updated');
    expect(String(patched.body.entry.defaultMarkupPercent)).toBe('0.35');

    await agent.delete(`/api/entries/${entry.id}`).expect(204);
    const list = await agent.get(`/api/price-books/${book.id}/entries`).expect(200);
    expect(list.body.total).toBe(0);
  });

  it('rejects non-admin writes with 403', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const book = (await agent.post('/api/price-books').send({ name: 'C' }).expect(201)).body
      .priceBook;
    const cat = (
      await agent.post(`/api/price-books/${book.id}/categories`).send({ name: 'X' }).expect(201)
    ).body.category;

    const memberEmail = await makeNonAdmin(organization.id, 'PM');
    const member = await loginAs(memberEmail);

    // Reads OK.
    await member.get(`/api/price-books/${book.id}/entries`).expect(200);

    // Writes denied.
    const create = await member
      .post(`/api/price-books/${book.id}/entries`)
      .send({ categoryId: cat.id, description: 'x', unitOfMeasure: 'EA' });
    expect(create.status).toBe(403);
  });
});

// ─── CSV import HTTP surface ───────────────────────────────────────────────

describe('POST /api/price-books/:id/import', () => {
  it('accepts a clean CSV upload (commit) and returns the result envelope', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const book = (await agent.post('/api/price-books').send({ name: 'C' }).expect(201)).body
      .priceBook;

    const csv = [
      'category,description,unit_of_measure,unit_cost_material,unit_cost_labor',
      'Drywall,5/8 gypsum,SF,1.0,2.0',
    ].join('\n');

    const res = await agent
      .post(`/api/price-books/${book.id}/import`)
      .attach('file', Buffer.from(csv), { filename: 'pricing.csv', contentType: 'text/csv' });
    expect(res.status).toBe(200);
    expect(res.body.committed).toBe(true);
    expect(res.body.entriesToCreate).toBe(1);
    expect(res.body.categoriesToCreate).toEqual(['Drywall']);
  });

  it('returns 403 for non-admin members', async () => {
    const { user, organization } = await makeOwner();
    const agent = await loginAs(user.email);
    const book = (await agent.post('/api/price-books').send({ name: 'C' }).expect(201)).body
      .priceBook;
    const memberEmail = await makeNonAdmin(organization.id, 'PM');
    const member = await loginAs(memberEmail);
    const csv = 'category,description,unit_of_measure,unit_cost_material,unit_cost_labor\n';
    const res = await member
      .post(`/api/price-books/${book.id}/import`)
      .attach('file', Buffer.from(csv), 'pricing.csv');
    expect(res.status).toBe(403);
  });

  it('returns 400 when no file is attached', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);
    const book = (await agent.post('/api/price-books').send({ name: 'C' }).expect(201)).body
      .priceBook;
    const res = await agent.post(`/api/price-books/${book.id}/import`);
    expect(res.status).toBe(400);
  });
});

// ─── MarkupRule ────────────────────────────────────────────────────────────

describe('MarkupRule CRUD', () => {
  it('creates / lists / patches / deletes', async () => {
    const { user } = await makeOwner();
    const agent = await loginAs(user.email);

    const created = await agent
      .post('/api/markup-rules')
      .send({
        name: 'Demo gets 25%',
        appliesTo: 'CATEGORY',
        matchValue: 'Demolition',
        markupPercent: '0.25',
        priority: 100,
      })
      .expect(201);
    expect(created.body.markupRule.name).toBe('Demo gets 25%');

    const list = await agent.get('/api/markup-rules').expect(200);
    expect(list.body.markupRules).toHaveLength(1);

    const patched = await agent
      .patch(`/api/markup-rules/${created.body.markupRule.id}`)
      .send({ markupPercent: '0.30' })
      .expect(200);
    expect(String(patched.body.markupRule.markupPercent)).toBe('0.3');

    await agent.delete(`/api/markup-rules/${created.body.markupRule.id}`).expect(204);
    const after = await agent.get('/api/markup-rules').expect(200);
    expect(after.body.markupRules).toHaveLength(0);
  });
});
