/**
 * Integration tests for the GENERATE_LINE_ITEMS pipeline.
 *
 * Anthropic is faked via __setAnthropicClientForTesting; the rest hits
 * the real database so we exercise the actual SQL writes (sections,
 * line items, totals, snapshot pricing, regenerate-preserves-manual).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import {
  __setAnthropicClientForTesting,
  type AnthropicLike,
} from '../../lib/anthropic.js';
import * as pricingService from '../../services/pricingService.js';
import { generate } from '../lineGenerationService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function setup() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `Gen-${counter}-${RUN_ID}`,
    email: `gen-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Gen',
    lastName: 'Test',
  });
  orgIds.add(result.organization.id);

  const book = await pricingService.createPriceBook(result.organization.id, {
    name: 'Test Book',
    isDefault: true,
  });
  const drywall = await pricingService.createCategory(result.organization.id, book.id, {
    name: 'Drywall',
    defaultMarkupPercent: '0.20',
  });
  const demo = await pricingService.createCategory(result.organization.id, book.id, {
    name: 'Demolition',
    defaultMarkupPercent: '0.20',
  });

  const e1 = await pricingService.createEntry(result.organization.id, book.id, {
    categoryId: drywall.id,
    code: 'D-100',
    description: '5/8" Type X gypsum, taped Level 4',
    unitOfMeasure: 'SF',
    unitCostMaterial: '1.20',
    unitCostLabor: '2.10',
    aiKeywords: 'drywall sheetrock partition',
  });
  const e2 = await pricingService.createEntry(result.organization.id, book.id, {
    categoryId: demo.id,
    code: 'DM-100',
    description: 'Demo gypsum partition',
    unitOfMeasure: 'SF',
    unitCostMaterial: '0.50',
    unitCostLabor: '2.00',
    aiKeywords: 'demo demolition',
  });

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: result.organization.id,
      number: `GEN-26-${String(counter).padStart(3, '0')}`,
      title: 'Acme Suite 400 TI',
      drafterId: result.user.id,
      clientCompanyName: 'Acme Corp',
    },
  });

  await prisma.sourceInput.create({
    data: {
      organizationId: result.organization.id,
      estimateId: estimate.id,
      type: 'TRANSCRIPT',
      title: 'Site walkthrough',
      content: 'Demo the back wall and frame a new partition.',
      addedById: result.user.id,
    },
  });

  return {
    organizationId: result.organization.id,
    userId: result.user.id,
    estimateId: estimate.id,
    book: { id: book.id, drywall, demo, e1, e2 },
  };
}

function fakeClient(create: (body: unknown) => Promise<unknown>): AnthropicLike {
  return { messages: { create } } as unknown as AnthropicLike;
}

const baseUsage = { input_tokens: 100, output_tokens: 80 };

function makeAnthropicResponse(toolInput: unknown) {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'tool',
        name: 'submit_line_items',
        input: toolInput,
      },
    ],
    usage: baseUsage,
  };
}

beforeEach(() => {
  __setAnthropicClientForTesting(undefined);
});
afterEach(() => {
  __setAnthropicClientForTesting(undefined);
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.aIMessage.deleteMany({ where: { organizationId: orgId } });
    await prisma.aIRun.deleteMany({ where: { organizationId: orgId } });
    await prisma.aIConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.lineItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.scopeSection.deleteMany({ where: { organizationId: orgId } });
    await prisma.sourceInput.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBookEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBookCategory.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBook.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('lineGenerationService.generate', () => {
  it('creates sections + AI line items, snapshots price-book costs, classifies status correctly', async () => {
    const ctx = await setup();
    __setAnthropicClientForTesting(
      fakeClient(async () =>
        makeAnthropicResponse({
          scopeSummary: 'Demo back wall, frame and finish a new partition.',
          assumptions: ['10\' ceiling height', 'Existing electrical to be reused'],
          sections: [
            {
              name: 'Demolition',
              categoryName: 'Demolition',
              lineItems: [
                {
                  description: 'Demo existing back-wall gypsum partition',
                  quantity: 100,
                  unitOfMeasure: 'SF',
                  priceBookEntryCode: 'DM-100',
                  priceBookEntryDescription: null,
                  aiConfidence: 0.92,
                  aiAssumption: null,
                },
              ],
            },
            {
              name: 'Drywall',
              categoryName: 'Drywall',
              lineItems: [
                {
                  description: 'New 5/8 Type X partition, both sides, Level 4',
                  quantity: 200,
                  unitOfMeasure: 'SF',
                  priceBookEntryCode: 'D-100',
                  priceBookEntryDescription: null,
                  aiConfidence: 0.88,
                  aiAssumption: null,
                },
                {
                  description: 'Custom soffit',
                  quantity: 1,
                  unitOfMeasure: 'LS',
                  priceBookEntryCode: null,
                  priceBookEntryDescription: null,
                  aiConfidence: 0.5,
                  aiAssumption: 'Sub-quote required',
                },
              ],
            },
          ],
        }),
      ),
    );

    const result = await generate(ctx.organizationId, ctx.userId, ctx.estimateId);
    expect(result.sectionsCreated).toBe(2);
    expect(result.lineItemsCreated).toBe(3);

    const sections = await prisma.scopeSection.findMany({
      where: { estimateId: ctx.estimateId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    expect(sections.map((s) => s.name)).toEqual(['Demolition', 'Drywall']);

    const lines = await prisma.lineItem.findMany({
      where: { estimateId: ctx.estimateId, deletedAt: null },
      orderBy: [{ scopeSectionId: 'asc' }, { order: 'asc' }],
    });
    expect(lines).toHaveLength(3);

    const demoLine = lines.find((li) => li.priceBookEntryId === ctx.book.e2.id);
    expect(demoLine).toBeTruthy();
    expect(demoLine?.source).toBe('AI_GENERATED');
    expect(demoLine?.status).toBe('DRAFT'); // confidence 0.92, matched
    expect(String(demoLine?.unitCostMaterial)).toBe('0.5');
    expect(String(demoLine?.unitCostLabor)).toBe('2');
    expect(demoLine?.sourceRunId).toBeTruthy();

    const drywallLine = lines.find((li) => li.priceBookEntryId === ctx.book.e1.id);
    expect(drywallLine?.status).toBe('DRAFT'); // 0.88

    const soffit = lines.find((li) => !li.priceBookEntryId);
    expect(soffit?.status).toBe('NO_PRICE');

    // Estimate totals reflect the new lines.
    const estimate = await prisma.estimate.findUnique({ where: { id: ctx.estimateId } });
    expect(Number(estimate?.totalSellPrice)).toBeGreaterThan(0);

    // PriceBookEntry usage incremented.
    const fresh = await prisma.priceBookEntry.findUnique({ where: { id: ctx.book.e1.id } });
    expect(fresh?.usageCount).toBe(1);
  });

  it('flags low-confidence matched lines as NEEDS_REVIEW', async () => {
    const ctx = await setup();
    __setAnthropicClientForTesting(
      fakeClient(async () =>
        makeAnthropicResponse({
          scopeSummary: 'Drywall only',
          assumptions: [],
          sections: [
            {
              name: 'Drywall',
              categoryName: 'Drywall',
              lineItems: [
                {
                  description: 'Some drywall',
                  quantity: 50,
                  unitOfMeasure: 'SF',
                  priceBookEntryCode: 'D-100',
                  priceBookEntryDescription: null,
                  aiConfidence: 0.55,
                  aiAssumption: 'unsure on quantity',
                },
              ],
            },
          ],
        }),
      ),
    );
    await generate(ctx.organizationId, ctx.userId, ctx.estimateId);
    const lines = await prisma.lineItem.findMany({ where: { estimateId: ctx.estimateId } });
    expect(lines[0]?.status).toBe('NEEDS_REVIEW');
  });

  it('regenerate replaces AI lines but preserves MANUAL lines', async () => {
    const ctx = await setup();

    // First generation
    __setAnthropicClientForTesting(
      fakeClient(async () =>
        makeAnthropicResponse({
          scopeSummary: 'first',
          assumptions: [],
          sections: [
            {
              name: 'Drywall',
              categoryName: 'Drywall',
              lineItems: [
                {
                  description: 'First drywall',
                  quantity: 10,
                  unitOfMeasure: 'SF',
                  priceBookEntryCode: 'D-100',
                  priceBookEntryDescription: null,
                  aiConfidence: 0.9,
                  aiAssumption: null,
                },
              ],
            },
          ],
        }),
      ),
    );
    await generate(ctx.organizationId, ctx.userId, ctx.estimateId);

    // Manually add a non-AI line item to the same section.
    const section = await prisma.scopeSection.findFirstOrThrow({
      where: { estimateId: ctx.estimateId, name: 'Drywall' },
    });
    await prisma.lineItem.create({
      data: {
        organizationId: ctx.organizationId,
        estimateId: ctx.estimateId,
        scopeSectionId: section.id,
        description: 'Manual line — keep me!',
        quantity: '5',
        unitOfMeasure: 'EA',
        unitCostMaterial: '10',
        unitCostLabor: '0',
        markupPercent: '0.2',
        lineCost: '50',
        lineSellPrice: '60',
        source: 'MANUAL',
        status: 'CONFIRMED',
        order: 100,
      },
    });

    // Second generation overwrites AI lines.
    __setAnthropicClientForTesting(
      fakeClient(async () =>
        makeAnthropicResponse({
          scopeSummary: 'second',
          assumptions: [],
          sections: [
            {
              name: 'Drywall',
              categoryName: 'Drywall',
              lineItems: [
                {
                  description: 'Refreshed drywall',
                  quantity: 20,
                  unitOfMeasure: 'SF',
                  priceBookEntryCode: 'D-100',
                  priceBookEntryDescription: null,
                  aiConfidence: 0.9,
                  aiAssumption: null,
                },
              ],
            },
          ],
        }),
      ),
    );
    await generate(ctx.organizationId, ctx.userId, ctx.estimateId);

    const lines = await prisma.lineItem.findMany({
      where: { estimateId: ctx.estimateId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    const sources = lines.map((l) => l.source).sort();
    expect(sources).toContain('MANUAL');
    expect(sources).toContain('AI_GENERATED');
    const aiCount = lines.filter((l) => l.source === 'AI_GENERATED').length;
    expect(aiCount).toBe(1); // refreshed only — no leftover from first run

    const manual = lines.find((l) => l.source === 'MANUAL');
    expect(manual?.description).toBe('Manual line — keep me!');
  });

  it('rejects when default price book is missing', async () => {
    const ctx = await setup();
    await prisma.priceBook.update({
      where: { id: ctx.book.id },
      data: { isDefault: false },
    });
    await expect(
      generate(ctx.organizationId, ctx.userId, ctx.estimateId),
    ).rejects.toThrow(/default price book/i);
  });
});
