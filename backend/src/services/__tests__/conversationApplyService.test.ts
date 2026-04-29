/**
 * Integration tests for applying ASK_FOLLOWUP proposed actions.
 *
 * Each test seeds an estimate (+ optional section/line) directly via
 * Prisma, manufactures an ASK_FOLLOWUP AIRun whose outputs.proposedActions
 * carries the patch under test, then calls applyForRun and asserts the
 * estimate reflects the change. Idempotency is verified by replaying the
 * same call and asserting it 409s.
 */

import { afterAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import { applyForRun } from '../conversationApplyService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function setup() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `Apply-${counter}-${RUN_ID}`,
    email: `apply-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Apply',
    lastName: 'Test',
  });
  orgIds.add(result.organization.id);

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: result.organization.id,
      number: `APP-26-${String(counter).padStart(3, '0')}`,
      title: 'Apply Suite TI',
      drafterId: result.user.id,
    },
  });

  const section = await prisma.scopeSection.create({
    data: {
      organizationId: result.organization.id,
      estimateId: estimate.id,
      name: 'Demolition',
      order: 0,
    },
  });

  const lineItem = await prisma.lineItem.create({
    data: {
      organizationId: result.organization.id,
      estimateId: estimate.id,
      scopeSectionId: section.id,
      description: 'Demo back wall',
      quantity: '100',
      unitOfMeasure: 'SF',
      unitCostMaterial: '1',
      unitCostLabor: '2',
      markupPercent: '0.20',
      lineCost: '300',
      lineSellPrice: '360',
      status: 'DRAFT',
      source: 'AI_GENERATED',
      order: 0,
    },
  });

  const conv = await prisma.aIConversation.create({
    data: {
      organizationId: result.organization.id,
      estimateId: estimate.id,
      modelVersion: 'claude-haiku-4-5-20251001',
    },
  });

  return {
    organizationId: result.organization.id,
    user: result.user,
    estimate,
    section,
    lineItem,
    conversation: conv,
  };
}

async function makeAskRun(opts: {
  organizationId: string;
  conversationId: string;
  estimateId: string;
  userId: string;
  proposedActions: unknown[];
  status?: 'SUCCEEDED' | 'FAILED';
}) {
  return prisma.aIRun.create({
    data: {
      organizationId: opts.organizationId,
      conversationId: opts.conversationId,
      estimateId: opts.estimateId,
      triggeredById: opts.userId,
      runType: 'ASK_FOLLOWUP',
      status: opts.status ?? 'SUCCEEDED',
      modelVersion: 'claude-haiku-4-5-20251001',
      inputs: {},
      outputs: {
        assistantMessage: 'Sure thing',
        suggestedAction: 'none',
        proposedActions: opts.proposedActions,
      } as Prisma.InputJsonValue,
      tokensInput: 50,
      tokensOutput: 30,
      costUsd: '0.001',
      durationMs: 200,
      completedAt: new Date(),
    },
  });
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.aIMessage.deleteMany({ where: { organizationId: orgId } });
    await prisma.aIRun.deleteMany({ where: { organizationId: orgId } });
    await prisma.aIConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.lineItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.scopeSection.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('conversationApplyService.applyForRun', () => {
  it('applies ADD_LINE_ITEM by creating the line in the named section', async () => {
    const ctx = await setup();
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      proposedActions: [
        {
          type: 'ADD_LINE_ITEM',
          scopeSectionId: ctx.section.id,
          description: 'Paint touch-up',
          quantity: '200',
          unitOfMeasure: 'SF',
          aiAssumption: null,
        },
      ],
    });

    const result = await applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.type).toBe('ADD_LINE_ITEM');

    const items = await prisma.lineItem.findMany({
      where: { estimateId: ctx.estimate.id, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    expect(items).toHaveLength(2);
    const created = items.find((i) => i.description === 'Paint touch-up');
    expect(created).toBeTruthy();
    expect(created?.scopeSectionId).toBe(ctx.section.id);
    expect(created?.unitOfMeasure).toBe('SF');
    expect(created?.source).toBe('AI_GENERATED');
    expect(created?.status).toBe('NEEDS_REVIEW');
  });

  it('applies UPDATE_LINE_ITEM by patching the existing line', async () => {
    const ctx = await setup();
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      proposedActions: [
        {
          type: 'UPDATE_LINE_ITEM',
          lineItemId: ctx.lineItem.id,
          quantity: '250',
        },
      ],
    });

    await applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id);

    const updated = await prisma.lineItem.findUniqueOrThrow({ where: { id: ctx.lineItem.id } });
    expect(updated.quantity.toString()).toBe('250');
    // lineCost should have recomputed (qty * (mat+labor)) = 250 * 3 = 750.
    expect(updated.lineCost.toString()).toBe('750');
  });

  it('applies REMOVE_LINE_ITEM by soft-deleting the line', async () => {
    const ctx = await setup();
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      proposedActions: [
        { type: 'REMOVE_LINE_ITEM', lineItemId: ctx.lineItem.id },
      ],
    });

    await applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id);

    const stillThere = await prisma.lineItem.findFirst({
      where: { id: ctx.lineItem.id, deletedAt: null },
    });
    expect(stillThere).toBeNull();
  });

  it('applies ADD_SECTION by creating a new section on the estimate', async () => {
    const ctx = await setup();
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      proposedActions: [
        { type: 'ADD_SECTION', name: 'Finishes', description: null },
      ],
    });

    const result = await applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id);
    expect(result.applied[0]?.type).toBe('ADD_SECTION');

    const sections = await prisma.scopeSection.findMany({
      where: { estimateId: ctx.estimate.id, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.name)).toContain('Finishes');
  });

  it('refuses a second apply on the same run (idempotent)', async () => {
    const ctx = await setup();
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      proposedActions: [
        { type: 'ADD_SECTION', name: 'Mill / Cabinetry', description: null },
      ],
    });

    await applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id);
    await expect(
      applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id),
    ).rejects.toThrow(/already been applied/i);
  });

  it('rejects an unknown lineItemId before mutating any state', async () => {
    const ctx = await setup();
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      proposedActions: [
        { type: 'UPDATE_LINE_ITEM', lineItemId: 'doesnotexist', quantity: '10' },
      ],
    });

    await expect(
      applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id),
    ).rejects.toThrow(/lineItemId|line/i);

    // Original line untouched.
    const stillOriginal = await prisma.lineItem.findUniqueOrThrow({
      where: { id: ctx.lineItem.id },
    });
    expect(stillOriginal.quantity.toString()).toBe('100');
  });

  it('rejects when run did not succeed', async () => {
    const ctx = await setup();
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      status: 'FAILED',
      proposedActions: [
        { type: 'ADD_SECTION', name: 'Fail', description: null },
      ],
    });

    await expect(
      applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id),
    ).rejects.toThrow(/run_not_succeeded|did not succeed/i);
  });

  it('rejects when proposedActions is empty', async () => {
    const ctx = await setup();
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      proposedActions: [],
    });

    await expect(
      applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id),
    ).rejects.toThrow(/no proposed actions/i);
  });

  it('rejects when estimate is locked (SENT/WON/LOST)', async () => {
    const ctx = await setup();
    await prisma.estimate.update({
      where: { id: ctx.estimate.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    const run = await makeAskRun({
      organizationId: ctx.organizationId,
      conversationId: ctx.conversation.id,
      estimateId: ctx.estimate.id,
      userId: ctx.user.id,
      proposedActions: [
        { type: 'ADD_SECTION', name: 'NopeSection', description: null },
      ],
    });

    await expect(
      applyForRun(ctx.organizationId, ctx.user, ctx.estimate.id, run.id),
    ).rejects.toThrow(/locked|SENT|cannot/i);
  });
});
