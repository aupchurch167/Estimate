/**
 * Integration tests for the dashboard aggregator (Phase 5.1).
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import { loadDashboard } from '../dashboardService.js';
import {
  approve,
  markWon,
  submitForReview,
} from '../reviewWorkflowService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function setup() {
  counter += 1;
  const owner = await serviceSignup({
    companyName: `Dash-${counter}-${RUN_ID}`,
    email: `dash-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'D',
    lastName: 'Owner',
  });
  orgIds.add(owner.organization.id);
  const drafter = await prisma.user.update({
    where: { id: owner.user.id },
    data: { role: 'ESTIMATOR' },
  });

  counter += 1;
  const reviewerSignup = await serviceSignup({
    companyName: `Dash-Rev-${counter}-${RUN_ID}`,
    email: `dashr-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'R',
    lastName: 'V',
  });
  orgIds.add(reviewerSignup.organization.id);
  const reviewer = await prisma.user.update({
    where: { id: reviewerSignup.user.id },
    data: { organizationId: drafter.organizationId, role: 'ESTIMATOR' },
  });

  return { drafter, reviewer, organizationId: drafter.organizationId };
}

async function makeEstimate(
  orgId: string,
  drafterId: string,
  reviewerId: string,
  overrides: { status?: string; sellPrice?: string; title?: string } = {},
) {
  counter += 1;
  return prisma.estimate.create({
    data: {
      organizationId: orgId,
      number: `D-26-${String(counter).padStart(3, '0')}`,
      title: overrides.title ?? `Estimate ${counter}`,
      drafterId,
      reviewerId,
      status: (overrides.status ?? 'DRAFT') as never,
      totalSellPrice: overrides.sellPrice ?? '0',
      ...(overrides.status === 'WON' ? { wonAt: new Date() } : {}),
    },
  });
}

afterAll(async () => {
  for (const orgId of orgIds) {
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

describe('dashboardService.loadDashboard', () => {
  it('aggregates pipeline counts + assigned reviews + my drafts + recent activity', async () => {
    const ctx = await setup();
    // Create a spread of estimates across statuses.
    await makeEstimate(ctx.organizationId, ctx.drafter.id, ctx.reviewer.id, {
      status: 'DRAFT',
      sellPrice: '500',
      title: 'My DRAFT',
    });
    await makeEstimate(ctx.organizationId, ctx.drafter.id, ctx.reviewer.id, {
      status: 'REVISED',
      sellPrice: '600',
    });
    const inReview = await makeEstimate(
      ctx.organizationId,
      ctx.drafter.id,
      ctx.reviewer.id,
      { status: 'IN_REVIEW', sellPrice: '700' },
    );
    void inReview;
    await makeEstimate(ctx.organizationId, ctx.drafter.id, ctx.reviewer.id, {
      status: 'APPROVED',
      sellPrice: '1000',
    });
    await makeEstimate(ctx.organizationId, ctx.drafter.id, ctx.reviewer.id, {
      status: 'SENT',
      sellPrice: '2000',
    });
    await makeEstimate(ctx.organizationId, ctx.drafter.id, ctx.reviewer.id, {
      status: 'WON',
      sellPrice: '3000',
    });

    const dash = await loadDashboard(ctx.organizationId, ctx.reviewer.id);

    // Pipeline counts cover every status.
    expect(dash.pipeline.counts.DRAFT).toBe(1);
    expect(dash.pipeline.counts.IN_REVIEW).toBe(1);
    expect(dash.pipeline.counts.APPROVED).toBe(1);
    expect(dash.pipeline.counts.SENT).toBe(1);
    expect(dash.pipeline.counts.WON).toBe(1);
    expect(dash.pipeline.counts.LOST).toBe(0);
    expect(dash.pipeline.counts.REVISED).toBe(1);

    // Dollar totals.
    expect(Number(dash.pipeline.totalApprovedSellPrice)).toBe(1000);
    expect(Number(dash.pipeline.totalSentSellPrice)).toBe(2000);
    expect(Number(dash.pipeline.wonThisMonthSellPrice)).toBe(3000);
    expect(dash.pipeline.wonThisMonthCount).toBe(1);

    // Reviewer sees the IN_REVIEW estimate in assignedReviews.
    expect(dash.assignedReviews).toHaveLength(1);
    expect(dash.assignedReviews[0]?.status).toBe('IN_REVIEW');

    // Drafter sees their DRAFT + REVISED in myDrafts (load as drafter).
    const drafterDash = await loadDashboard(ctx.organizationId, ctx.drafter.id);
    expect(drafterDash.myDrafts.map((e) => e.status).sort()).toEqual(['DRAFT', 'REVISED']);

    // No assigned reviews for the drafter (they're not the reviewer).
    expect(drafterDash.assignedReviews).toHaveLength(0);
  });

  it('recentActivity reflects workflow transitions newest-first with actor + estimate link', async () => {
    const ctx = await setup();
    const e = await makeEstimate(
      ctx.organizationId,
      ctx.drafter.id,
      ctx.reviewer.id,
      { sellPrice: '1500' },
    );
    await submitForReview(ctx.organizationId, ctx.drafter, e.id);
    await approve(ctx.organizationId, ctx.reviewer, e.id);
    await prisma.estimate.update({
      where: { id: e.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    await markWon(ctx.organizationId, ctx.reviewer, e.id);

    const dash = await loadDashboard(ctx.organizationId, ctx.drafter.id);
    const eventTypes = dash.recentActivity.map((a) => a.eventType);
    // Newest first, and includes the four transitions we just made.
    expect(eventTypes).toContain('ESTIMATE_WON');
    expect(eventTypes).toContain('ESTIMATE_APPROVED');
    expect(eventTypes).toContain('ESTIMATE_SUBMITTED_FOR_REVIEW');
    // Ordering: WON should come before SUBMITTED.
    const idxWon = eventTypes.indexOf('ESTIMATE_WON');
    const idxSub = eventTypes.indexOf('ESTIMATE_SUBMITTED_FOR_REVIEW');
    expect(idxWon).toBeLessThan(idxSub);

    // Each row has the estimate number + actor.
    const won = dash.recentActivity.find((a) => a.eventType === 'ESTIMATE_WON');
    expect(won?.estimate?.number).toBe(e.number);
    expect(won?.actor?.firstName).toBeTruthy();
  });

  it('only counts estimates from the calling org', async () => {
    const a = await setup();
    const b = await setup();
    await makeEstimate(a.organizationId, a.drafter.id, a.reviewer.id, {
      status: 'WON',
      sellPrice: '1000',
    });
    await makeEstimate(b.organizationId, b.drafter.id, b.reviewer.id, {
      status: 'WON',
      sellPrice: '9999',
    });
    const dashA = await loadDashboard(a.organizationId, a.drafter.id);
    expect(dashA.pipeline.counts.WON).toBe(1);
    expect(Number(dashA.pipeline.wonThisMonthSellPrice)).toBe(1000);
  });
});
