/**
 * Integration tests for notificationService (Phase 4.8).
 *
 * Email is faked via __setEmailDispatcherForTesting; the rest hits the
 * real DB so we exercise creation, list, count, mark-read, and the
 * cross-org guard.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import {
  __setEmailDispatcherForTesting,
  type EmailDispatcher,
} from '../../lib/email.js';
import {
  listForUser,
  markAllRead,
  markRead,
  notify,
  unreadCount,
} from '../notificationService.js';
import {
  approve,
  markWon,
  requestChanges,
  submitForReview,
} from '../reviewWorkflowService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

function fakeEmail() {
  const sent: { to: string | string[]; subject: string }[] = [];
  const dispatcher: EmailDispatcher & { sent: typeof sent } = {
    sent,
    async send({ to, subject }) {
      sent.push({ to, subject });
      return { dispatched: true };
    },
  };
  return dispatcher;
}

async function setup() {
  counter += 1;
  const owner = await serviceSignup({
    companyName: `Notif-${counter}-${RUN_ID}`,
    email: `nf-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'N',
    lastName: 'Owner',
  });
  orgIds.add(owner.organization.id);
  const drafter = await prisma.user.update({
    where: { id: owner.user.id },
    data: { role: 'ESTIMATOR' },
  });

  counter += 1;
  const reviewerSignup = await serviceSignup({
    companyName: `Notif-Rev-${counter}-${RUN_ID}`,
    email: `nfr-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Reviewer',
    lastName: 'V',
  });
  orgIds.add(reviewerSignup.organization.id);
  const reviewer = await prisma.user.update({
    where: { id: reviewerSignup.user.id },
    data: { organizationId: drafter.organizationId, role: 'ESTIMATOR' },
  });

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: drafter.organizationId,
      number: `NF-26-${String(counter).padStart(3, '0')}`,
      title: 'Notif test',
      drafterId: drafter.id,
      reviewerId: reviewer.id,
    },
  });

  return {
    organizationId: drafter.organizationId,
    drafter: { id: drafter.id, role: 'ESTIMATOR' as const },
    reviewer: { id: reviewer.id, role: 'ESTIMATOR' as const },
    estimateId: estimate.id,
    drafterEmail: drafter.email,
    reviewerEmail: reviewer.email,
  };
}

beforeEach(() => {
  __setEmailDispatcherForTesting(undefined);
});
afterEach(() => {
  __setEmailDispatcherForTesting(undefined);
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateExport.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimateSnapshot.deleteMany({ where: { organizationId: orgId } });
    await prisma.reviewAction.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('notificationService.notify', () => {
  it('writes a notification row and dispatches email', async () => {
    const ctx = await setup();
    const em = fakeEmail();
    __setEmailDispatcherForTesting(em);

    const n = await notify({
      organizationId: ctx.organizationId,
      recipientId: ctx.reviewer.id,
      type: 'REVIEW_REQUESTED',
      title: 'You have a review',
      body: 'Please look at this',
      entityType: 'Estimate',
      entityId: ctx.estimateId,
    });

    expect(n).not.toBeNull();
    expect(n?.emailSent).toBe(true);
    expect(em.sent[0]?.to).toBe(ctx.reviewerEmail);
    expect(em.sent[0]?.subject).toBe('You have a review');
  });

  it('inAppOnly skips email', async () => {
    const ctx = await setup();
    const em = fakeEmail();
    __setEmailDispatcherForTesting(em);

    const n = await notify({
      organizationId: ctx.organizationId,
      recipientId: ctx.reviewer.id,
      type: 'COMMENT_MENTION',
      title: 'You were mentioned',
      inAppOnly: true,
    });

    expect(n?.emailSent).toBe(false);
    expect(em.sent).toHaveLength(0);
  });

  it('returns null and logs when recipient is missing or in another org', async () => {
    const ctx = await setup();
    const result = await notify({
      organizationId: 'other-org',
      recipientId: ctx.reviewer.id,
      type: 'REVIEW_REQUESTED',
      title: 'wrong org',
    });
    expect(result).toBeNull();
  });

  it('does NOT throw when email dispatch fails — workflow continues', async () => {
    const ctx = await setup();
    __setEmailDispatcherForTesting({
      async send() {
        return { dispatched: false, reason: 'sendgrid_error' };
      },
    });
    const n = await notify({
      organizationId: ctx.organizationId,
      recipientId: ctx.reviewer.id,
      type: 'REVIEW_REQUESTED',
      title: 'OK',
    });
    expect(n).not.toBeNull();
    expect(n?.emailSent).toBe(false);
  });
});

describe('notificationService read helpers', () => {
  it('listForUser returns newest-first; unreadOnly filters; unreadCount + markRead + markAllRead work', async () => {
    const ctx = await setup();
    __setEmailDispatcherForTesting(fakeEmail());

    const a = await notify({
      organizationId: ctx.organizationId,
      recipientId: ctx.reviewer.id,
      type: 'REVIEW_REQUESTED',
      title: 'A',
    });
    const b = await notify({
      organizationId: ctx.organizationId,
      recipientId: ctx.reviewer.id,
      type: 'REVIEW_REQUESTED',
      title: 'B',
    });

    let list = await listForUser(ctx.reviewer.id);
    expect(list.map((n) => n.title)).toEqual(['B', 'A']);
    expect(await unreadCount(ctx.reviewer.id)).toBe(2);

    await markRead(ctx.reviewer.id, a!.id);
    list = await listForUser(ctx.reviewer.id, { unreadOnly: true });
    expect(list.map((n) => n.title)).toEqual(['B']);
    expect(await unreadCount(ctx.reviewer.id)).toBe(1);

    const swept = await markAllRead(ctx.reviewer.id);
    expect(swept).toBe(1);
    expect(await unreadCount(ctx.reviewer.id)).toBe(0);
    void b;
  });

  it('markRead refuses notifications that belong to another user', async () => {
    const ctx = await setup();
    __setEmailDispatcherForTesting(fakeEmail());
    const n = await notify({
      organizationId: ctx.organizationId,
      recipientId: ctx.reviewer.id,
      type: 'REVIEW_REQUESTED',
      title: 'private',
    });
    await expect(markRead(ctx.drafter.id, n!.id)).rejects.toThrow();
  });
});

describe('notification emit hooks across the workflow', () => {
  it('submitForReview notifies the reviewer', async () => {
    const ctx = await setup();
    __setEmailDispatcherForTesting(fakeEmail());
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    // notify is fire-and-forget — give it a tick to settle.
    await new Promise((r) => setTimeout(r, 50));
    const list = await listForUser(ctx.reviewer.id);
    expect(list[0]?.type).toBe('REVIEW_REQUESTED');
    expect(list[0]?.entityId).toBe(ctx.estimateId);
  });

  it('approve notifies the drafter', async () => {
    const ctx = await setup();
    __setEmailDispatcherForTesting(fakeEmail());
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    await new Promise((r) => setTimeout(r, 50));
    const list = await listForUser(ctx.drafter.id);
    expect(list[0]?.type).toBe('REVIEW_APPROVED');
  });

  it('requestChanges notifies the drafter with the change-request note', async () => {
    const ctx = await setup();
    __setEmailDispatcherForTesting(fakeEmail());
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await requestChanges(ctx.organizationId, ctx.reviewer, ctx.estimateId, {
      note: 'tighten demo',
    });
    await new Promise((r) => setTimeout(r, 50));
    const list = await listForUser(ctx.drafter.id);
    expect(list[0]?.type).toBe('REVIEW_CHANGES_REQUESTED');
    expect(list[0]?.body).toMatch(/tighten/);
  });

  it('markWon notifies the drafter (and the reviewer if different)', async () => {
    const ctx = await setup();
    __setEmailDispatcherForTesting(fakeEmail());
    await submitForReview(ctx.organizationId, ctx.drafter, ctx.estimateId);
    await approve(ctx.organizationId, ctx.reviewer, ctx.estimateId);
    await prisma.estimate.update({
      where: { id: ctx.estimateId },
      data: { status: 'SENT', sentAt: new Date() },
    });
    // Acting as a fresh admin so both drafter + reviewer get notified.
    const adminSignup = await serviceSignup({
      companyName: `Notif-Adm-${counter++}-${RUN_ID}`,
      email: `nfa-${counter}-${RUN_ID}@example.test`,
      password: 'OriginalPass1!',
      firstName: 'A',
      lastName: 'X',
    });
    orgIds.add(adminSignup.organization.id);
    const admin = await prisma.user.update({
      where: { id: adminSignup.user.id },
      data: { organizationId: ctx.organizationId, role: 'ADMIN' },
    });

    await markWon(
      ctx.organizationId,
      { id: admin.id, role: 'ADMIN' },
      ctx.estimateId,
    );
    await new Promise((r) => setTimeout(r, 50));

    const drafterList = await listForUser(ctx.drafter.id);
    expect(drafterList[0]?.type).toBe('ESTIMATE_WON');
    const reviewerList = await listForUser(ctx.reviewer.id);
    expect(reviewerList[0]?.type).toBe('ESTIMATE_WON');
  });
});
