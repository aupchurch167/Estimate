/**
 * Integration tests for the admin AI usage rollup (Phase 5.2).
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import { getUsageForOrg } from '../aiUsageService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function setup() {
  counter += 1;
  const owner = await serviceSignup({
    companyName: `Usage-${counter}-${RUN_ID}`,
    email: `use-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'U',
    lastName: 'Owner',
  });
  orgIds.add(owner.organization.id);
  // Cap so the response carries it.
  await prisma.orgSettings.update({
    where: { organizationId: owner.organization.id },
    data: { monthlyAiCostCapUsd: '100' },
  });

  counter += 1;
  const otherSignup = await serviceSignup({
    companyName: `Usage-Other-${counter}-${RUN_ID}`,
    email: `useo-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'O',
    lastName: 'X',
  });
  orgIds.add(otherSignup.organization.id);
  const other = await prisma.user.update({
    where: { id: otherSignup.user.id },
    data: { organizationId: owner.organization.id, role: 'ESTIMATOR' },
  });

  const estimateA = await prisma.estimate.create({
    data: {
      organizationId: owner.organization.id,
      number: `USE-26-${String(counter).padStart(3, '0')}-A`,
      title: 'Estimate A',
      drafterId: owner.user.id,
    },
  });
  const estimateB = await prisma.estimate.create({
    data: {
      organizationId: owner.organization.id,
      number: `USE-26-${String(counter).padStart(3, '0')}-B`,
      title: 'Estimate B',
      drafterId: owner.user.id,
    },
  });

  return {
    organizationId: owner.organization.id,
    owner: owner.user,
    other,
    estimateA,
    estimateB,
  };
}

async function ensureConv(orgId: string, estimateId: string) {
  const existing = await prisma.aIConversation.findUnique({ where: { estimateId } });
  if (existing) return existing;
  return prisma.aIConversation.create({
    data: { organizationId: orgId, estimateId, modelVersion: 'claude-sonnet-4-6' },
  });
}

async function makeRun(args: {
  orgId: string;
  estimateId: string;
  userId: string;
  costUsd: string;
  status?: 'SUCCEEDED' | 'FAILED';
  errorMessage?: string | null;
}) {
  const conv = await ensureConv(args.orgId, args.estimateId);
  return prisma.aIRun.create({
    data: {
      organizationId: args.orgId,
      conversationId: conv.id,
      estimateId: args.estimateId,
      triggeredById: args.userId,
      runType: 'GENERATE_LINE_ITEMS',
      status: args.status ?? 'SUCCEEDED',
      modelVersion: 'claude-sonnet-4-6',
      costUsd: args.costUsd,
      tokensInput: 100,
      tokensOutput: 100,
      durationMs: 1500,
      inputs: {},
      errorMessage: args.errorMessage ?? null,
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
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('aiUsageService.getUsageForOrg', () => {
  it('returns the cap, MTD totals, and zero-padded daily series when no runs exist', async () => {
    const ctx = await setup();
    const data = await getUsageForOrg(ctx.organizationId);
    expect(data.capUsd).toBe('100');
    expect(Number(data.monthToDateUsd)).toBe(0);
    expect(data.monthToDateRunCount).toBe(0);
    expect(data.byUser).toHaveLength(0);
    expect(data.byEstimate).toHaveLength(0);
    expect(data.recentRuns).toHaveLength(0);
    expect(data.dailySeries).toHaveLength(data.windowDays);
    expect(data.dailySeries.every((p) => p.costUsd === '0' && p.runCount === 0)).toBe(true);
  });

  it('aggregates by user, by estimate, and includes failed runs in totals + recents', async () => {
    const ctx = await setup();
    await makeRun({
      orgId: ctx.organizationId,
      estimateId: ctx.estimateA.id,
      userId: ctx.owner.id,
      costUsd: '0.50',
    });
    await makeRun({
      orgId: ctx.organizationId,
      estimateId: ctx.estimateA.id,
      userId: ctx.other.id,
      costUsd: '1.25',
    });
    await makeRun({
      orgId: ctx.organizationId,
      estimateId: ctx.estimateB.id,
      userId: ctx.other.id,
      costUsd: '0.75',
      status: 'FAILED',
      errorMessage: 'boom',
    });

    const data = await getUsageForOrg(ctx.organizationId);
    expect(Number(data.monthToDateUsd)).toBeCloseTo(2.5, 2);
    expect(data.monthToDateRunCount).toBe(3);

    // By user — `other` had 2 runs totaling 2.0, `owner` had 1 totaling 0.5.
    const otherUser = data.byUser.find((u) => u.userId === ctx.other.id);
    expect(Number(otherUser?.costUsd ?? '0')).toBeCloseTo(2.0, 2);
    expect(otherUser?.runCount).toBe(2);

    // By estimate — A had 2 runs, B had 1 (the failed one).
    const a = data.byEstimate.find((e) => e.estimateId === ctx.estimateA.id);
    expect(a?.runCount).toBe(2);
    expect(Number(a?.costUsd ?? '0')).toBeCloseTo(1.75, 2);

    // Recent runs include the FAILED one with errorMessage surfaced.
    const failed = data.recentRuns.find((r) => r.status === 'FAILED');
    expect(failed?.errorMessage).toBe('boom');
    expect(failed?.estimate?.id).toBe(ctx.estimateB.id);
    expect(failed?.triggeredBy?.id).toBe(ctx.other.id);
  });

  it('throws NotFound when org settings are missing', async () => {
    await expect(getUsageForOrg('not-a-real-org')).rejects.toThrow();
  });
});
