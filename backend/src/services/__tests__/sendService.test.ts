/**
 * Integration tests for the Send pipeline (Phase 4.6).
 *
 * Spaces + email are both faked so we exercise the real PDF render and
 * the DB writes (snapshot, export, status flip, activity event).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import {
  __setSpacesClientForTesting,
  type SpacesLike,
} from '../../lib/spaces.js';
import {
  __setEmailDispatcherForTesting,
  type EmailDispatcher,
} from '../../lib/email.js';
import { sendEstimate } from '../sendService.js';
import { approve, submitForReview } from '../reviewWorkflowService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

function fakeSpaces() {
  const uploads: { key: string; size: number; contentType: string }[] = [];
  const sp: SpacesLike & { uploads: typeof uploads } = {
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
  return sp;
}

function fakeEmail() {
  const sent: { to: string | string[]; subject: string; attachmentBytes: number }[] = [];
  const dispatcher: EmailDispatcher & { sent: typeof sent } = {
    sent,
    async send({ to, subject, attachments }) {
      sent.push({
        to,
        subject,
        attachmentBytes: attachments?.[0]?.content.length ?? 0,
      });
      return { dispatched: true };
    },
  };
  return dispatcher;
}

async function setup() {
  counter += 1;
  const owner = await serviceSignup({
    companyName: `Send-${counter}-${RUN_ID}`,
    email: `snd-${counter}-${RUN_ID}@example.test`,
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
    companyName: `Send-Rev-${counter}-${RUN_ID}`,
    email: `sndr-${counter}-${RUN_ID}@example.test`,
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
    companyName: `Send-Adm-${counter}-${RUN_ID}`,
    email: `snda-${counter}-${RUN_ID}@example.test`,
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
      number: `SND-26-${String(counter).padStart(3, '0')}`,
      title: 'Send test',
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

beforeEach(() => {
  __setSpacesClientForTesting(undefined);
  __setEmailDispatcherForTesting(undefined);
});
afterEach(() => {
  __setSpacesClientForTesting(undefined);
  __setEmailDispatcherForTesting(undefined);
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

async function moveToApproved(ctx: Awaited<ReturnType<typeof setup>>) {
  await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
  await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
}

describe('sendService.sendEstimate', () => {
  it('full happy path: SEND snapshot + export row + status SENT + email with PDF attached', async () => {
    const ctx = await setup();
    const sp = fakeSpaces();
    const em = fakeEmail();
    __setSpacesClientForTesting(sp);
    __setEmailDispatcherForTesting(em);

    await moveToApproved(ctx);

    const result = await sendEstimate(ctx.organizationId, ctx.admin, ctx.estimateId, {
      recipients: ['client@acme.test'],
      subject: 'Your estimate',
      message: 'Hey — see attached.',
    });

    expect(result.estimate.status).toBe('SENT');
    expect(result.estimate.sentAt).toBeInstanceOf(Date);
    expect(result.snapshot.snapshotType).toBe('SEND');
    expect(result.email.dispatched).toBe(true);

    expect(sp.uploads).toHaveLength(1);
    expect(sp.uploads[0]?.contentType).toBe('application/pdf');
    expect(sp.uploads[0]?.key).toMatch(/send-/);

    expect(em.sent).toHaveLength(1);
    expect(em.sent[0]?.to).toEqual(['client@acme.test']);
    expect(em.sent[0]?.subject).toBe('Your estimate');
    expect(em.sent[0]?.attachmentBytes).toBeGreaterThan(500);

    const activity = await prisma.activityEvent.findFirst({
      where: { estimateId: ctx.estimateId, eventType: 'ESTIMATE_SENT' },
    });
    expect(activity).toBeTruthy();
    expect(activity?.meta).toMatchObject({
      snapshotId: result.snapshot.id,
      exportId: result.exportId,
      recipients: ['client@acme.test'],
    });
  });

  it('rejects when estimate is not APPROVED', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting(fakeSpaces());
    __setEmailDispatcherForTesting(fakeEmail());
    await expect(
      sendEstimate(ctx.organizationId, ctx.admin, ctx.estimateId, {
        recipients: ['client@acme.test'],
      }),
    ).rejects.toMatchObject({ code: 'invalid_status_transition' });
    const fresh = await prisma.estimate.findUniqueOrThrow({
      where: { id: ctx.estimateId },
    });
    expect(fresh.status).toBe('DRAFT');
  });

  it('rejects empty / invalid recipients', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting(fakeSpaces());
    __setEmailDispatcherForTesting(fakeEmail());
    await moveToApproved(ctx);
    await expect(
      sendEstimate(ctx.organizationId, ctx.admin, ctx.estimateId, {
        recipients: [],
      }),
    ).rejects.toThrow(/required/i);
    await expect(
      sendEstimate(ctx.organizationId, ctx.admin, ctx.estimateId, {
        recipients: ['not-an-email'],
      }),
    ).rejects.toThrow(/invalid email/i);
  });

  it('honors drafterCanSend=false for ESTIMATOR drafters', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting(fakeSpaces());
    __setEmailDispatcherForTesting(fakeEmail());
    await moveToApproved(ctx);
    await prisma.orgSettings.update({
      where: { organizationId: ctx.organizationId },
      data: { drafterCanSend: false },
    });
    await expect(
      sendEstimate(ctx.organizationId, ctx.drafter, ctx.estimateId, {
        recipients: ['client@acme.test'],
      }),
    ).rejects.toThrow(/cannot send/i);
    // Admin can still send.
    const result = await sendEstimate(ctx.organizationId, ctx.admin, ctx.estimateId, {
      recipients: ['client@acme.test'],
    });
    expect(result.estimate.status).toBe('SENT');
  });

  it('email failure does NOT roll back status — SENT stays', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting(fakeSpaces());
    __setEmailDispatcherForTesting({
      async send() {
        return { dispatched: false, reason: 'sendgrid_error' };
      },
    });
    await moveToApproved(ctx);
    const result = await sendEstimate(ctx.organizationId, ctx.admin, ctx.estimateId, {
      recipients: ['client@acme.test'],
    });
    expect(result.estimate.status).toBe('SENT');
    expect(result.email.dispatched).toBe(false);
    expect(result.email.reason).toBe('sendgrid_error');
  });

  it('Spaces upload failure rolls back: status stays APPROVED, no export row', async () => {
    const ctx = await setup();
    __setSpacesClientForTesting({
      async uploadBuffer() {
        throw new Error('storage exploded');
      },
      async signGetUrl() {
        return 'unused';
      },
      async signPutUrl() {
        return 'unused';
      },
    });
    __setEmailDispatcherForTesting(fakeEmail());
    await moveToApproved(ctx);

    await expect(
      sendEstimate(ctx.organizationId, ctx.admin, ctx.estimateId, {
        recipients: ['client@acme.test'],
      }),
    ).rejects.toThrow(/storage exploded/i);

    const fresh = await prisma.estimate.findUniqueOrThrow({
      where: { id: ctx.estimateId },
    });
    expect(fresh.status).toBe('APPROVED');
    const exports = await prisma.estimateExport.count({
      where: { estimateId: ctx.estimateId },
    });
    expect(exports).toBe(0);
  });
});
