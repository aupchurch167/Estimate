/**
 * Integration tests for the comment + activity services (Phase 4.2).
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import * as commentService from '../commentService.js';
import * as activityFeedService from '../activityFeedService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function setup() {
  counter += 1;
  const owner = await serviceSignup({
    companyName: `Cmt-${counter}-${RUN_ID}`,
    email: `cmt-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Cmt',
    lastName: 'Owner',
  });
  orgIds.add(owner.organization.id);

  counter += 1;
  const reviewerSignup = await serviceSignup({
    companyName: `Cmt-Rev-${counter}-${RUN_ID}`,
    email: `cmtr-${counter}-${RUN_ID}@example.test`,
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
  const otherSignup = await serviceSignup({
    companyName: `Cmt-Other-${counter}-${RUN_ID}`,
    email: `cmto-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'O',
    lastName: 'X',
  });
  orgIds.add(otherSignup.organization.id);
  const other = await prisma.user.update({
    where: { id: otherSignup.user.id },
    data: { organizationId: owner.organization.id, role: 'ESTIMATOR' },
  });

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: owner.organization.id,
      number: `CMT-26-${String(counter).padStart(3, '0')}`,
      title: 'Comment test',
      drafterId: owner.user.id,
      reviewerId: reviewer.id,
    },
  });

  return {
    organizationId: owner.organization.id,
    owner: { id: owner.user.id, role: 'OWNER' as const },
    reviewer: { id: reviewer.id, role: 'ESTIMATOR' as const },
    other: { id: other.id, role: 'ESTIMATOR' as const },
    estimateId: estimate.id,
  };
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.comment.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('commentService', () => {
  it('creates a comment and writes a COMMENT_ADDED activity', async () => {
    const ctx = await setup();
    const c = await commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
      body: '  Looks good. ',
    });
    expect(c.body).toBe('Looks good.');
    expect(c.author.id).toBe(ctx.owner.id);

    const activity = await prisma.activityEvent.findFirst({
      where: {
        estimateId: ctx.estimateId,
        eventType: 'COMMENT_ADDED',
      },
    });
    expect(activity).toBeTruthy();
  });

  it('rejects empty / too-long bodies', async () => {
    const ctx = await setup();
    await expect(
      commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
        body: '   ',
      }),
    ).rejects.toThrow(/empty/i);
    await expect(
      commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
        body: 'a'.repeat(5000),
      }),
    ).rejects.toThrow(/too long/i);
  });

  it('lists comments oldest-first with author info', async () => {
    const ctx = await setup();
    await commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
      body: 'first',
    });
    await commentService.create(ctx.organizationId, ctx.reviewer, ctx.estimateId, {
      body: 'second',
    });
    const list = await commentService.listForEstimate(ctx.organizationId, ctx.estimateId);
    expect(list.map((c) => c.body)).toEqual(['first', 'second']);
    expect(list[0]?.author.firstName).toBeTruthy();
  });

  it('author + reviewer + admin can resolve; others cannot', async () => {
    const ctx = await setup();
    const c = await commentService.create(ctx.organizationId, ctx.other, ctx.estimateId, {
      body: 'flag this',
    });

    // unauthorized: someone else who isn't author / reviewer / admin
    const stranger = ctx.reviewer; // reviewer can resolve, so not unauthorized
    void stranger;
    // build a fresh user not the reviewer
    const intruderSignup = await serviceSignup({
      companyName: `Intruder-${counter++}-${RUN_ID}`,
      email: `intr-${counter}-${RUN_ID}@example.test`,
      password: 'OriginalPass1!',
      firstName: 'I',
      lastName: 'X',
    });
    orgIds.add(intruderSignup.organization.id);
    const intruder = await prisma.user.update({
      where: { id: intruderSignup.user.id },
      data: { organizationId: ctx.organizationId, role: 'ESTIMATOR' },
    });

    await expect(
      commentService.setResolved(
        ctx.organizationId,
        { id: intruder.id, role: 'ESTIMATOR' },
        c.id,
        true,
      ),
    ).rejects.toThrow(/cannot/i);

    // Author can resolve
    const resolvedByAuthor = await commentService.setResolved(
      ctx.organizationId,
      ctx.other,
      c.id,
      true,
    );
    expect(resolvedByAuthor.isResolved).toBe(true);
    expect(resolvedByAuthor.resolvedById).toBe(ctx.other.id);

    // Toggle off via reviewer
    const unresolved = await commentService.setResolved(
      ctx.organizationId,
      ctx.reviewer,
      c.id,
      false,
    );
    expect(unresolved.isResolved).toBe(false);
    expect(unresolved.resolvedAt).toBeNull();
  });

  it('soft-deletes; only author or admin can', async () => {
    const ctx = await setup();
    const c = await commentService.create(ctx.organizationId, ctx.other, ctx.estimateId, {
      body: 'gone',
    });

    await expect(
      commentService.softDelete(ctx.organizationId, ctx.reviewer, c.id),
    ).rejects.toThrow(/cannot/i);

    await commentService.softDelete(ctx.organizationId, ctx.other, c.id);
    const list = await commentService.listForEstimate(ctx.organizationId, ctx.estimateId);
    expect(list.find((x) => x.id === c.id)).toBeUndefined();
  });

  it('rejects line-item attachments that do not belong to the estimate', async () => {
    const ctx = await setup();
    await expect(
      commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
        body: 'on a line',
        lineItemId: 'nope',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('activityFeedService.listForEstimate', () => {
  it('returns events newest-first with actor info', async () => {
    const ctx = await setup();
    await commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
      body: 'first',
    });
    await commentService.create(ctx.organizationId, ctx.reviewer, ctx.estimateId, {
      body: 'second',
    });
    const events = await activityFeedService.listForEstimate(
      ctx.organizationId,
      ctx.estimateId,
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
    // newest first, author info present
    expect(events[0]?.eventType).toBe('COMMENT_ADDED');
    expect(events[0]?.actor?.firstName).toBeTruthy();
  });

  it('throws NotFound for a different org', async () => {
    const ctx = await setup();
    await expect(
      activityFeedService.listForEstimate('other-org', ctx.estimateId),
    ).rejects.toThrow();
  });
});
