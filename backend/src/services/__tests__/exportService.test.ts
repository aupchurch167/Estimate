/**
 * Integration tests for the PDF export pipeline (Phase 4.5).
 *
 * Spaces is faked via __setSpacesClientForTesting so no network I/O —
 * we still exercise the real PDF render and the EstimateExport +
 * ActivityEvent persistence.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import {
  __setSpacesClientForTesting,
  type SpacesLike,
} from '../../lib/spaces.js';
import { renderEstimatePdf } from '../pdfService.js';
import { createExport, listForEstimate } from '../exportService.js';
import { approve, submitForReview } from '../reviewWorkflowService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

interface FakeSpaces extends SpacesLike {
  uploads: { key: string; size: number; contentType: string }[];
}

function fakeSpaces(): FakeSpaces {
  const uploads: FakeSpaces['uploads'] = [];
  return {
    uploads,
    async uploadBuffer({ key, body, contentType }) {
      uploads.push({ key, size: body.length, contentType });
    },
    async signGetUrl({ key }) {
      return `https://signed.test/${key}?sig=fake`;
    },
    async signPutUrl({ key }) {
      return `https://signed.test/${key}?put=fake`;
    },
  };
}

async function setup() {
  counter += 1;
  const owner = await serviceSignup({
    companyName: `Exp-${counter}-${RUN_ID}`,
    email: `exp-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'E',
    lastName: 'Owner',
  });
  orgIds.add(owner.organization.id);
  await prisma.user.update({
    where: { id: owner.user.id },
    data: { role: 'ESTIMATOR' },
  });
  counter += 1;
  const reviewerSignup = await serviceSignup({
    companyName: `Exp-Rev-${counter}-${RUN_ID}`,
    email: `expr-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'R',
    lastName: 'V',
  });
  orgIds.add(reviewerSignup.organization.id);
  const reviewer = await prisma.user.update({
    where: { id: reviewerSignup.user.id },
    data: { organizationId: owner.organization.id, role: 'ESTIMATOR' },
  });

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: owner.organization.id,
      number: `EXP-26-${String(counter).padStart(3, '0')}`,
      title: 'Acme TI',
      drafterId: owner.user.id,
      reviewerId: reviewer.id,
      clientCompanyName: 'Acme Corp',
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
      aiAssumption: 'Wall is non-structural — confirm.',
      order: 0,
    },
  });

  return {
    organizationId: owner.organization.id,
    drafter: { id: owner.user.id, role: 'ESTIMATOR' as const },
    reviewer: { id: reviewer.id, role: 'ESTIMATOR' as const },
    estimateId: estimate.id,
  };
}

beforeEach(() => {
  __setSpacesClientForTesting(undefined);
});
afterEach(() => {
  __setSpacesClientForTesting(undefined);
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateExport.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateSnapshot.deleteMany({ where: { organizationId: orgId } });
    await prisma.reviewAction.deleteMany({ where: { organizationId: orgId } });
    await prisma.lineItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.scopeSection.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('pdfService.renderEstimatePdf', () => {
  it('produces a non-empty PDF buffer that starts with %PDF-', async () => {
    const buffer = await renderEstimatePdf(
      {
        estimate: {
          id: 'e1',
          number: 'TEST-001',
          title: 'Test Estimate',
          description: null,
          status: 'APPROVED',
          clientCompanyName: 'Acme',
          clientContactName: null,
          clientContactEmail: null,
          projectAddressLine1: '123 Main',
          projectAddressLine2: null,
          projectCity: 'NY',
          projectState: 'NY',
          projectPostalCode: '10001',
          totalCost: '1000',
          totalMarkup: '200',
          totalSellPrice: '1200',
          validUntil: null,
          createdAt: new Date('2026-04-28'),
        },
        scopeSections: [
          { id: 's1', name: 'Demo', description: null, order: 0 },
        ],
        lineItems: [
          {
            id: 'l1',
            scopeSectionId: 's1',
            description: 'Demo wall',
            quantity: '100',
            unitOfMeasure: 'SF',
            lineSellPrice: '360',
            aiAssumption: 'Confirm structural.',
          },
        ],
      },
      { organizationName: 'Mark Allan' },
    );
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('exportService.createExport', () => {
  it('renders + uploads + writes EstimateExport tied to the latest snapshot', async () => {
    const ctx = await setup();
    const fake = fakeSpaces();
    __setSpacesClientForTesting(fake);

    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const ap = await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);

    const result = await createExport({
      organizationId: ctx.organizationId,
      userId: ctx.drafter.id,
      estimateId: ctx.estimateId,
      format: 'PDF',
    });

    expect(result.export.snapshotId).toBe(ap.reviewAction.snapshotId);
    expect(result.export.fileSizeBytes).toBeGreaterThan(500);
    expect(result.downloadUrl).toMatch(/^https:\/\/signed\.test\//);
    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0]?.contentType).toBe('application/pdf');
    expect(fake.uploads[0]?.key).toMatch(/^exports\//);

    const activity = await prisma.activityEvent.findFirst({
      where: { estimateId: ctx.estimateId, eventType: 'ESTIMATE_EXPORTED' },
    });
    expect(activity).toBeTruthy();
    expect(activity?.meta).toMatchObject({ format: 'PDF' });
  });

  it('returns 409 no_snapshot_to_export when no snapshot exists yet', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting(fakeSpaces());
    await expect(
      createExport({
        organizationId: ctx.organizationId,
        userId: ctx.drafter.id,
        estimateId: ctx.estimateId,
        format: 'PDF',
      }),
    ).rejects.toMatchObject({ code: 'no_snapshot_to_export' });
  });

  it('rejects unsupported formats', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting(fakeSpaces());
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    await expect(
      createExport({
        organizationId: ctx.organizationId,
        userId: ctx.drafter.id,
        estimateId: ctx.estimateId,
        format: 'XLSX',
      }),
    ).rejects.toMatchObject({ code: 'unsupported_export_format' });
  });

  it('honors snapshotId when given (exports the older version)', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting(fakeSpaces());
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    const ap = await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);

    const r = await createExport({
      organizationId: ctx.organizationId,
      userId: ctx.drafter.id,
      estimateId: ctx.estimateId,
      format: 'PDF',
      snapshotId: ap.reviewAction.snapshotId,
    });
    expect(r.export.snapshotId).toBe(ap.reviewAction.snapshotId);
  });

  it('listForEstimate returns past exports newest-first with signed download URLs', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting(fakeSpaces());
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);

    await createExport({
      organizationId: ctx.organizationId,
      userId: ctx.drafter.id,
      estimateId: ctx.estimateId,
      format: 'PDF',
    });
    await createExport({
      organizationId: ctx.organizationId,
      userId: ctx.drafter.id,
      estimateId: ctx.estimateId,
      format: 'PDF',
    });

    const list = await listForEstimate(ctx.organizationId, ctx.estimateId);
    expect(list).toHaveLength(2);
    expect(list[0]?.downloadUrl).toMatch(/^https:\/\/signed\.test\//);
    // newest first
    expect(list[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
      list[1]!.createdAt.getTime(),
    );
  });
});
