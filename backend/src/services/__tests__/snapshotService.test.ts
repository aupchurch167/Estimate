/**
 * Integration tests for snapshotService (Phase 4.4).
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import {
  createSnapshot,
  getSnapshot,
  listForEstimate,
} from '../snapshotService.js';
import { approve, submitForReview, unlock } from '../reviewWorkflowService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function setup() {
  counter += 1;
  const owner = await serviceSignup({
    companyName: `Snap-${counter}-${RUN_ID}`,
    email: `snap-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'S',
    lastName: 'Owner',
  });
  orgIds.add(owner.organization.id);
  await prisma.user.update({
    where: { id: owner.user.id },
    data: { role: 'ESTIMATOR' },
  });

  counter += 1;
  const reviewerSignup = await serviceSignup({
    companyName: `Snap-Rev-${counter}-${RUN_ID}`,
    email: `snapr-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'R',
    lastName: 'V',
  });
  orgIds.add(reviewerSignup.organization.id);
  const reviewer = await prisma.user.update({
    where: { id: reviewerSignup.user.id },
    data: { organizationId: owner.organization.id, role: 'ESTIMATOR' },
  });

  counter += 1;
  const adminSignup = await serviceSignup({
    companyName: `Snap-Adm-${counter}-${RUN_ID}`,
    email: `snapa-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'A',
    lastName: 'X',
  });
  orgIds.add(adminSignup.organization.id);
  const admin = await prisma.user.update({
    where: { id: adminSignup.user.id },
    data: { organizationId: owner.organization.id, role: 'ADMIN' },
  });

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: owner.organization.id,
      number: `SNAP-26-${String(counter).padStart(3, '0')}`,
      title: 'Snapshot test',
      drafterId: owner.user.id,
      reviewerId: reviewer.id,
      totalCost: '1000',
      totalMarkup: '200',
      totalSellPrice: '1200',
    },
  });

  const section = await prisma.scopeSection.create({
    data: {
      organizationId: owner.organization.id,
      estimateId: estimate.id,
      name: 'Demolition',
      order: 0,
    },
  });
  await prisma.lineItem.create({
    data: {
      organizationId: owner.organization.id,
      estimateId: estimate.id,
      scopeSectionId: section.id,
      description: 'Demo wall',
      quantity: '100',
      unitOfMeasure: 'SF',
      unitCostMaterial: '1',
      unitCostLabor: '2',
      markupPercent: '0.20',
      lineCost: '300',
      lineSellPrice: '360',
      status: 'DRAFT',
      source: 'MANUAL',
      order: 0,
    },
  });

  return {
    organizationId: owner.organization.id,
    drafter: { id: owner.user.id, role: 'ESTIMATOR' as const },
    reviewer: { id: reviewer.id, role: 'ESTIMATOR' as const },
    admin: { id: admin.id, role: 'ADMIN' as const },
    estimateId: estimate.id,
  };
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateExport.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateSnapshot.deleteMany({ where: { organizationId: orgId } });
    await prisma.reviewAction.deleteMany({ where: { organizationId: orgId } });
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

describe('snapshotService.createSnapshot (standalone)', () => {
  it('captures the estimate header + sections + lines + sources, with sequence 1', async () => {
    const ctx = await setup();
    const snap = await createSnapshot({
      organizationId: ctx.organizationId,
      estimateId: ctx.estimateId,
      userId: ctx.drafter.id,
      snapshotType: 'APPROVAL',
    });
    expect(snap.sequence).toBe(1);
    expect(snap.snapshotType).toBe('APPROVAL');
    expect(snap.totalSellPrice.toString()).toBe('1200');

    const data = snap.estimateData as {
      estimate: { title: string };
      scopeSections: { name: string }[];
      lineItems: { description: string }[];
    };
    expect(data.estimate.title).toBe('Snapshot test');
    expect(data.scopeSections.map((s) => s.name)).toEqual(['Demolition']);
    expect(data.lineItems[0]?.description).toBe('Demo wall');
  });

  it('increments sequence per estimate', async () => {
    const ctx = await setup();
    const a = await createSnapshot({
      organizationId: ctx.organizationId,
      estimateId: ctx.estimateId,
      userId: ctx.drafter.id,
      snapshotType: 'APPROVAL',
    });
    const b = await createSnapshot({
      organizationId: ctx.organizationId,
      estimateId: ctx.estimateId,
      userId: ctx.drafter.id,
      snapshotType: 'REVISION',
    });
    expect(a.sequence).toBe(1);
    expect(b.sequence).toBe(2);
  });

  it('throws NotFound for a different org', async () => {
    const ctx = await setup();
    await expect(
      createSnapshot({
        organizationId: 'nope',
        estimateId: ctx.estimateId,
        userId: ctx.drafter.id,
        snapshotType: 'APPROVAL',
      }),
    ).rejects.toThrow();
  });
});

describe('snapshots emitted by review-workflow transitions', () => {
  it('approve writes an APPROVAL snapshot and links its id on the ReviewAction', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const result = await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);

    expect(result.reviewAction.snapshotId).toBeTruthy();
    const snap = await prisma.estimateSnapshot.findUniqueOrThrow({
      where: { id: result.reviewAction.snapshotId! },
    });
    expect(snap.snapshotType).toBe('APPROVAL');

    // ActivityEvent meta carries the snapshotId.
    const ev = await prisma.activityEvent.findFirst({
      where: { estimateId: ctx.estimateId, eventType: 'ESTIMATE_APPROVED' },
    });
    expect(ev?.meta).toMatchObject({ snapshotId: snap.id });
  });

  it('unlock writes a REVISION snapshot of the still-APPROVED state', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);

    const result = await unlock(ctx.organizationId, ctx.admin, ctx.estimateId);
    expect(result.reviewAction.snapshotId).toBeTruthy();
    const snap = await prisma.estimateSnapshot.findUniqueOrThrow({
      where: { id: result.reviewAction.snapshotId! },
    });
    expect(snap.snapshotType).toBe('REVISION');
    expect(snap.sequence).toBe(2);
  });

  it('submitForReview does NOT create a snapshot', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const count = await prisma.estimateSnapshot.count({
      where: { estimateId: ctx.estimateId },
    });
    expect(count).toBe(0);
  });
});

describe('snapshotService.listForEstimate / getSnapshot', () => {
  it('list returns metadata only (no estimateData), newest first', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    await unlock(ctx.organizationId, ctx.admin, ctx.estimateId);

    const list = await listForEstimate(ctx.organizationId, ctx.estimateId);
    expect(list.map((s) => s.snapshotType)).toEqual(['REVISION', 'APPROVAL']);
    expect((list[0] as unknown as { estimateData?: unknown }).estimateData).toBeUndefined();
  });

  it('getSnapshot returns the full row with estimateData', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const ap = await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    const full = await getSnapshot(ctx.organizationId, ap.reviewAction.snapshotId!);
    expect(full.snapshotType).toBe('APPROVAL');
    expect(full.estimateData).toBeTruthy();
  });

  it('getSnapshot rejects cross-org access', async () => {
    const ctx = await setup();
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const ap = await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    await expect(
      getSnapshot('other-org', ap.reviewAction.snapshotId!),
    ).rejects.toThrow();
  });
});
