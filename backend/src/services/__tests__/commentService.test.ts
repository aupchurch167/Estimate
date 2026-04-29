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

describe('commentService — threading', () => {
  it('creates a reply rooted at a top-level comment', async () => {
    const ctx = await setup();
    const parent = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'top-level' },
    );
    const reply = await commentService.create(
      ctx.organizationId,
      ctx.reviewer,
      ctx.estimateId,
      { body: 'reply', parentCommentId: parent.id },
    );
    expect(reply.parentCommentId).toBe(parent.id);
    const list = await commentService.listForEstimate(ctx.organizationId, ctx.estimateId);
    expect(list.find((c) => c.id === reply.id)?.parentCommentId).toBe(parent.id);
  });

  it('rejects nested replies (reply-to-reply)', async () => {
    const ctx = await setup();
    const parent = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'top' },
    );
    const reply = await commentService.create(
      ctx.organizationId,
      ctx.reviewer,
      ctx.estimateId,
      { body: 'r1', parentCommentId: parent.id },
    );
    await expect(
      commentService.create(ctx.organizationId, ctx.other, ctx.estimateId, {
        body: 'r2',
        parentCommentId: reply.id,
      }),
    ).rejects.toThrow(/reply to a reply/i);
  });

  it('rejects parentCommentId pointing at a different estimate', async () => {
    const ctx = await setup();
    const parent = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'home' },
    );
    const otherEst = await prisma.estimate.create({
      data: {
        organizationId: ctx.organizationId,
        number: `CMT-26-OTHER-${counter}`,
        title: 'Other',
        drafterId: ctx.owner.id,
      },
    });
    await expect(
      commentService.create(ctx.organizationId, ctx.owner, otherEst.id, {
        body: 'cross',
        parentCommentId: parent.id,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('reply inherits lineItemId from the parent comment', async () => {
    const ctx = await setup();
    const section = await prisma.scopeSection.create({
      data: {
        organizationId: ctx.organizationId,
        estimateId: ctx.estimateId,
        name: 'Section',
        order: 0,
      },
    });
    const line = await prisma.lineItem.create({
      data: {
        organizationId: ctx.organizationId,
        estimateId: ctx.estimateId,
        scopeSectionId: section.id,
        description: 'L',
        quantity: '1',
        unitOfMeasure: 'EA',
        unitCostMaterial: '0',
        unitCostLabor: '0',
        markupPercent: '0',
        lineCost: '0',
        lineSellPrice: '0',
        status: 'DRAFT',
        source: 'MANUAL',
        order: 0,
      },
    });
    const parent = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'on the line', lineItemId: line.id },
    );
    const reply = await commentService.create(
      ctx.organizationId,
      ctx.reviewer,
      ctx.estimateId,
      { body: 'me too', parentCommentId: parent.id },
    );
    expect(reply.lineItemId).toBe(line.id);
  });
});

describe('commentService — edit window', () => {
  it('author can edit body within 15 minutes; lastEditedAt is set', async () => {
    const ctx = await setup();
    const c = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'first draft' },
    );
    expect(c.lastEditedAt).toBeNull();
    const edited = await commentService.updateBody(
      ctx.organizationId,
      ctx.owner,
      c.id,
      { body: 'second draft' },
    );
    expect(edited.body).toBe('second draft');
    expect(edited.lastEditedAt).toBeTruthy();
  });

  it('non-author cannot edit', async () => {
    const ctx = await setup();
    const c = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'mine' },
    );
    await expect(
      commentService.updateBody(ctx.organizationId, ctx.reviewer, c.id, {
        body: 'tampered',
      }),
    ).rejects.toThrow(/only the author/i);
  });

  it('rejects an edit older than 15 minutes', async () => {
    const ctx = await setup();
    const c = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'old' },
    );
    // Backdate the comment 16 minutes.
    await prisma.comment.update({
      where: { id: c.id },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    await expect(
      commentService.updateBody(ctx.organizationId, ctx.owner, c.id, {
        body: 'too late',
      }),
    ).rejects.toThrow(/edit_window_expired|window has passed/i);
  });

  it('rejects empty / overlong edits', async () => {
    const ctx = await setup();
    const c = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'starting' },
    );
    await expect(
      commentService.updateBody(ctx.organizationId, ctx.owner, c.id, { body: '   ' }),
    ).rejects.toThrow(/empty/i);
    await expect(
      commentService.updateBody(ctx.organizationId, ctx.owner, c.id, {
        body: 'a'.repeat(5000),
      }),
    ).rejects.toThrow(/too long/i);
  });
});

describe('commentService — mentions', () => {
  it('writes a COMMENT_MENTION notification for each valid org user', async () => {
    const ctx = await setup();
    await commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
      body: 'hey @r and @other',
      mentions: [ctx.reviewer.id, ctx.other.id],
    });
    const notifications = await prisma.notification.findMany({
      where: {
        organizationId: ctx.organizationId,
        type: 'COMMENT_MENTION',
      },
    });
    const recipientIds = notifications.map((n) => n.recipientId).sort();
    expect(recipientIds).toEqual([ctx.reviewer.id, ctx.other.id].sort());
  });

  it('does not notify the author when they accidentally mention themselves', async () => {
    const ctx = await setup();
    await commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
      body: 'me me me',
      mentions: [ctx.owner.id, ctx.reviewer.id],
    });
    const recipients = await prisma.notification.findMany({
      where: { organizationId: ctx.organizationId, type: 'COMMENT_MENTION' },
      select: { recipientId: true },
    });
    expect(recipients.map((r) => r.recipientId)).toEqual([ctx.reviewer.id]);
  });

  it('silently drops invalid / cross-org user IDs', async () => {
    const ctx = await setup();
    await commentService.create(ctx.organizationId, ctx.owner, ctx.estimateId, {
      body: 'hi',
      mentions: ['nope', ctx.reviewer.id],
    });
    const notifications = await prisma.notification.findMany({
      where: { organizationId: ctx.organizationId, type: 'COMMENT_MENTION' },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.recipientId).toBe(ctx.reviewer.id);
  });

  it('editing only notifies newly-mentioned users (not those mentioned originally)', async () => {
    const ctx = await setup();
    const c = await commentService.create(
      ctx.organizationId,
      ctx.owner,
      ctx.estimateId,
      { body: 'first', mentions: [ctx.reviewer.id] },
    );
    expect(
      await prisma.notification.count({
        where: { organizationId: ctx.organizationId, type: 'COMMENT_MENTION' },
      }),
    ).toBe(1);

    await commentService.updateBody(ctx.organizationId, ctx.owner, c.id, {
      body: 'edited — also tagging other',
      mentions: [ctx.reviewer.id, ctx.other.id],
    });
    const notifications = await prisma.notification.findMany({
      where: { organizationId: ctx.organizationId, type: 'COMMENT_MENTION' },
      orderBy: { createdAt: 'asc' },
    });
    expect(notifications.map((n) => n.recipientId)).toEqual([
      ctx.reviewer.id,
      ctx.other.id,
    ]);
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
