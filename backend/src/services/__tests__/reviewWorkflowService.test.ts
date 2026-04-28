/**
 * Integration tests for the estimate review-workflow state machine.
 *
 * Hits the real database so we verify ReviewAction + ActivityEvent rows
 * land alongside the status update in a single transaction.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import {
  approve,
  listReviewActions,
  markLost,
  markWon,
  requestChanges,
  reviseFromSent,
  submitForReview,
  unlock,
} from '../reviewWorkflowService.js';
import type { UserRole } from '@prisma/client';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function setup() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `Rev-${counter}-${RUN_ID}`,
    email: `rev-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Rev',
    lastName: 'Owner',
  });
  orgIds.add(result.organization.id);

  // Make the owner an estimator-drafter and add a separate estimator-reviewer.
  const drafter = await prisma.user.update({
    where: { id: result.user.id },
    data: { role: 'ESTIMATOR' },
  });

  counter += 1;
  const reviewerSignup = await serviceSignup({
    companyName: `Rev-Reviewer-${counter}-${RUN_ID}`,
    email: `revrev-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Rev',
    lastName: 'Reviewer',
  });
  orgIds.add(reviewerSignup.organization.id);
  const reviewer = await prisma.user.update({
    where: { id: reviewerSignup.user.id },
    data: { organizationId: drafter.organizationId, role: 'ESTIMATOR' },
  });

  // And an admin in the same org.
  counter += 1;
  const adminSignup = await serviceSignup({
    companyName: `Rev-Admin-${counter}-${RUN_ID}`,
    email: `revadm-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Rev',
    lastName: 'Admin',
  });
  orgIds.add(adminSignup.organization.id);
  const admin = await prisma.user.update({
    where: { id: adminSignup.user.id },
    data: { organizationId: drafter.organizationId, role: 'ADMIN' },
  });

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: drafter.organizationId,
      number: `REV-26-${String(counter).padStart(3, '0')}`,
      title: 'Review test',
      drafterId: drafter.id,
      reviewerId: reviewer.id,
    },
  });

  return {
    organizationId: drafter.organizationId,
    drafter: { id: drafter.id, role: 'ESTIMATOR' as UserRole },
    reviewer: { id: reviewer.id, role: 'ESTIMATOR' as UserRole },
    admin: { id: admin.id, role: 'ADMIN' as UserRole },
    estimateId: estimate.id,
  };
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.reviewAction.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateExport.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateSnapshot.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('reviewWorkflowService.submitForReview', () => {
  it('drafter moves DRAFT → IN_REVIEW and writes ReviewAction + ActivityEvent', async () => {
    const ctx = await setup();
    const { estimate, reviewAction } = await submitForReview(
      ctx.organizationId,
      ctx.drafter,
      ctx.estimateId,
    );
    expect(estimate.status).toBe('IN_REVIEW');
    expect(reviewAction.actionType).toBe('SUBMITTED_FOR_REVIEW');
    expect(reviewAction.fromStatus).toBe('DRAFT');
    expect(reviewAction.toStatus).toBe('IN_REVIEW');

    const activity = await prisma.activityEvent.findFirst({
      where: { estimateId: ctx.estimateId, eventType: 'ESTIMATE_SUBMITTED_FOR_REVIEW' },
    });
    expect(activity).toBeTruthy();
  });

  it('REVISED → IN_REVIEW writes a RESUBMITTED action', async () => {
    const ctx = await setup();
    await prisma.estimate.update({
      where: { id: ctx.estimateId },
      data: { status: 'REVISED' },
    });
    const result = await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    expect(result.estimate.status).toBe('IN_REVIEW');
    expect(result.reviewAction.actionType).toBe('RESUBMITTED');
    expect(result.reviewAction.fromStatus).toBe('REVISED');
  });

  it('non-drafter ESTIMATOR cannot submit', async () => {
    const ctx = await setup();
    await expect(
      submitForReview(ctx.organizationId, ctx.reviewer, ctx.estimateId),
    ).rejects.toThrow(/cannot submit/i);
  });

  it('admin can submit on behalf of the drafter', async () => {
    const ctx = await setup();
    const result = await submitForReview(ctx.organizationId, ctx.admin, ctx.estimateId);
    expect(result.estimate.status).toBe('IN_REVIEW');
  });

  it('rejects when estimate is not DRAFT/REVISED', async () => {
    const ctx = await setup();
    await prisma.estimate.update({
      where: { id: ctx.estimateId },
      data: { status: 'APPROVED' },
    });
    await expect(
      submitForReview(ctx.organizationId, ctx.admin, ctx.estimateId),
    ).rejects.toThrow();
  });

  it('reviewerId override updates the assignment', async () => {
    const ctx = await setup();
    // Drop the existing reviewer first.
    await prisma.estimate.update({
      where: { id: ctx.estimateId },
      data: { reviewerId: null },
    });
    const result = await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId, {
      reviewerId: ctx.reviewer.id,
    });
    expect(result.estimate.reviewerId).toBe(ctx.reviewer.id);
  });
});

describe('reviewWorkflowService.approve', () => {
  it('reviewer can approve IN_REVIEW → APPROVED', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const result = await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    expect(result.estimate.status).toBe('APPROVED');
    expect(result.reviewAction.actionType).toBe('APPROVED');
  });

  it('admin can approve any IN_REVIEW', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const result = await approve(ctx.organizationId, ctx.admin, ctx.estimateId);
    expect(result.estimate.status).toBe('APPROVED');
  });

  it('drafter cannot approve their own submission', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await expect(
      approve(ctx.organizationId, ctx.drafter, ctx.estimateId),
    ).rejects.toThrow(/cannot approve/i);
  });

  it('rejects when estimate is not IN_REVIEW', async () => {
    const ctx = await setup();
    await expect(
      approve(ctx.organizationId, ctx.reviewer, ctx.estimateId),
    ).rejects.toThrow();
  });
});

describe('reviewWorkflowService.requestChanges', () => {
  it('reviewer moves IN_REVIEW → REVISED with a required note', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const result = await requestChanges(ctx.organizationId, ctx.reviewer, ctx.estimateId, {
      note: 'Tighten the demo numbers.',
    });
    expect(result.estimate.status).toBe('REVISED');
    expect(result.reviewAction.actionType).toBe('REQUESTED_CHANGES');
    expect(result.reviewAction.note).toMatch(/tighten/i);

    const activity = await prisma.activityEvent.findFirst({
      where: { estimateId: ctx.estimateId, eventType: 'ESTIMATE_CHANGES_REQUESTED' },
    });
    expect(activity).toBeTruthy();
  });

  it('rejects empty / whitespace note', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await expect(
      requestChanges(ctx.organizationId, ctx.reviewer, ctx.estimateId, { note: '   ' }),
    ).rejects.toThrow(/required/i);
  });

  it('non-reviewer cannot request changes', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await expect(
      requestChanges(ctx.organizationId, ctx.drafter, ctx.estimateId, { note: 'no' }),
    ).rejects.toThrow(/cannot request/i);
  });
});

describe('reviewWorkflowService.unlock', () => {
  it('admin can unlock APPROVED → REVISED', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    const result = await unlock(ctx.organizationId, ctx.admin, ctx.estimateId, {
      note: 'Client requested change',
    });
    expect(result.estimate.status).toBe('REVISED');
    expect(result.reviewAction.actionType).toBe('UNLOCKED');
  });

  it('non-admin cannot unlock', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    await expect(
      unlock(ctx.organizationId, ctx.reviewer, ctx.estimateId),
    ).rejects.toThrow(/admins/i);
  });

  it('rejects when estimate is not APPROVED', async () => {
    const ctx = await setup();
    await expect(
      unlock(ctx.organizationId, ctx.admin, ctx.estimateId),
    ).rejects.toThrow();
  });
});

describe('reviewWorkflowService close-out (Phase 4.7)', () => {
  async function moveToSent(ctx: Awaited<ReturnType<typeof setup>>) {
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    await prisma.estimate.update({
      where: { id: ctx.estimateId },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  it('markWon: SENT → WON, sets wonAt, writes ESTIMATE_WON activity', async () => {
    const ctx = await setup();
    await moveToSent(ctx);
    const result = await markWon(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    expect(result.estimate.status).toBe('WON');
    expect(result.estimate.wonAt).toBeInstanceOf(Date);
    const ev = await prisma.activityEvent.findFirst({
      where: { estimateId: ctx.estimateId, eventType: 'ESTIMATE_WON' },
    });
    expect(ev).toBeTruthy();
  });

  it('markLost: SENT → LOST, requires lostReason, persists it on the estimate', async () => {
    const ctx = await setup();
    await moveToSent(ctx);
    await expect(
      markLost(ctx.organizationId, ctx.reviewer, ctx.estimateId, { lostReason: '   ' }),
    ).rejects.toThrow(/required/i);
    const result = await markLost(ctx.organizationId, ctx.reviewer, ctx.estimateId, {
      lostReason: 'Client picked another GC',
    });
    expect(result.estimate.status).toBe('LOST');
    expect(result.estimate.lostAt).toBeInstanceOf(Date);
    expect(result.estimate.lostReason).toBe('Client picked another GC');
  });

  it('reviseFromSent: SENT → REVISED, takes a REVISION snapshot, links it on the ReviewAction', async () => {
    const ctx = await setup();
    await moveToSent(ctx);
    const result = await reviseFromSent(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    expect(result.estimate.status).toBe('REVISED');
    expect(result.reviewAction.snapshotId).toBeTruthy();
    const snap = await prisma.estimateSnapshot.findUniqueOrThrow({
      where: { id: result.reviewAction.snapshotId! },
    });
    expect(snap.snapshotType).toBe('REVISION');
  });

  it('rejects when status is not SENT', async () => {
    const ctx = await setup();
    await expect(
      markWon(ctx.organizationId, ctx.admin, ctx.estimateId),
    ).rejects.toThrow();
    await expect(
      reviseFromSent(ctx.organizationId, ctx.admin, ctx.estimateId),
    ).rejects.toThrow();
  });

  it('PM cannot close out (role gate)', async () => {
    const ctx = await setup();
    await moveToSent(ctx);
    const pmSignup = await prisma.user.create({
      data: {
        organizationId: ctx.organizationId,
        email: `pm-cls-${Date.now()}-${Math.random()}@example.test`,
        firstName: 'P',
        lastName: 'M',
        role: 'PM',
        passwordHash: 'x',
        tokenVersion: 0,
      },
    });
    await expect(
      markWon(
        ctx.organizationId,
        { id: pmSignup.id, role: 'PM' },
        ctx.estimateId,
      ),
    ).rejects.toThrow(/cannot/i);
  });
});

describe('listReviewActions', () => {
  it('returns the chronological action history for an estimate', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await requestChanges(ctx.organizationId, ctx.reviewer, ctx.estimateId, {
      note: 'change me',
    });
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId, {
      note: 'looks good',
    });

    const actions = await listReviewActions(ctx.organizationId, ctx.estimateId);
    expect(actions.map((a) => a.actionType)).toEqual([
      'SUBMITTED_FOR_REVIEW',
      'REQUESTED_CHANGES',
      'RESUBMITTED',
      'APPROVED',
    ]);
  });

  it('throws NotFound when the estimate does not belong to the org', async () => {
    const ctx = await setup();
    await expect(listReviewActions('other-org', ctx.estimateId)).rejects.toThrow();
  });
});
