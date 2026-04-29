/**
 * Comment service.
 *
 * Per-estimate comments with optional line-item attachment, single-level
 * threading via parentCommentId, a 15-minute author edit window, and
 * @mention dispatch via the notification service.
 *
 * Permissions:
 *   - List: any org member.
 *   - Create / reply: any active org member.
 *   - Edit body: the author, within EDIT_WINDOW_MS of createdAt.
 *   - Resolve / unresolve: the author, the estimate's reviewer, or admin.
 *   - Soft delete: the author or admin.
 */

import type { Comment, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { notify } from './notificationService.js';
import { logger } from '../lib/logger.js';

const BODY_MAX = 4000;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

export type CommentWithAuthor = Comment & {
  author: { id: string; firstName: string; lastName: string; email: string };
};

export interface CommentActor {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER';
}

const ADMIN_ROLES: ReadonlySet<CommentActor['role']> = new Set(['OWNER', 'ADMIN']);

function withAuthor() {
  return {
    author: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
  } satisfies Prisma.CommentInclude;
}

async function loadEstimateOrThrow(organizationId: string, estimateId: string) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
    select: { id: true, title: true, reviewerId: true },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  return estimate;
}

export async function listForEstimate(
  organizationId: string,
  estimateId: string,
): Promise<CommentWithAuthor[]> {
  await loadEstimateOrThrow(organizationId, estimateId);
  return prisma.comment.findMany({
    where: { organizationId, estimateId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: withAuthor(),
  });
}

export interface CreateCommentInput {
  body: string;
  lineItemId?: string | null;
  /** Reply target. Must be a top-level comment on the same estimate. */
  parentCommentId?: string | null;
  /** Org user IDs to notify. Frontend collects these from its mention picker. */
  mentions?: string[];
}

export async function create(
  organizationId: string,
  actor: CommentActor,
  estimateId: string,
  input: CreateCommentInput,
): Promise<CommentWithAuthor> {
  const estimate = await loadEstimateOrThrow(organizationId, estimateId);
  const body = input.body.trim();
  if (body.length === 0) {
    throw new ValidationError('Comment body cannot be empty', {
      issues: [{ path: 'body', message: 'Required' }],
    });
  }
  if (body.length > BODY_MAX) {
    throw new ValidationError(`Comment is too long (max ${BODY_MAX} chars)`, {
      issues: [{ path: 'body', message: 'Too long' }],
    });
  }

  if (input.lineItemId) {
    const line = await prisma.lineItem.findFirst({
      where: {
        id: input.lineItemId,
        estimateId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!line) {
      throw new ValidationError('Line item not found on this estimate', {
        issues: [{ path: 'lineItemId', message: 'Not found' }],
      });
    }
  }

  let parentLineItemId: string | null = null;
  if (input.parentCommentId) {
    const parent = await prisma.comment.findFirst({
      where: {
        id: input.parentCommentId,
        estimateId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true, parentCommentId: true, lineItemId: true },
    });
    if (!parent) {
      throw new ValidationError('Parent comment not found on this estimate', {
        issues: [{ path: 'parentCommentId', message: 'Not found' }],
      });
    }
    if (parent.parentCommentId) {
      // Single-level threading: replies attach to top-level comments only.
      throw new ValidationError('Cannot reply to a reply', {
        issues: [{ path: 'parentCommentId', message: 'Replies must target top-level comments' }],
      });
    }
    // Reply inherits its parent's lineItem context.
    parentLineItemId = parent.lineItemId;
  }

  const mentions = await resolveMentions(organizationId, actor.id, input.mentions);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.comment.create({
      data: {
        organizationId,
        estimateId,
        lineItemId: input.parentCommentId ? parentLineItemId : input.lineItemId ?? null,
        authorId: actor.id,
        body,
        parentCommentId: input.parentCommentId ?? null,
      },
      include: withAuthor(),
    });
    // Skip activity for replies — the parent thread already shows in the feed.
    if (!input.parentCommentId) {
      await tx.activityEvent.create({
        data: {
          organizationId,
          actorId: actor.id,
          eventType: 'COMMENT_ADDED',
          entityType: 'Comment',
          entityId: row.id,
          estimateId,
          summary: input.lineItemId
            ? 'Added a comment on a line item'
            : 'Added a comment',
          meta: { commentId: row.id, lineItemId: input.lineItemId ?? null },
        },
      });
    }
    return row;
  });

  await notifyMentions({
    organizationId,
    estimateId,
    estimateTitle: estimate.title,
    commentId: created.id,
    body: created.body,
    actor,
    mentionedUserIds: mentions,
  });

  return created;
}

export interface UpdateCommentInput {
  body: string;
  mentions?: string[];
}

/**
 * Edit the body of an existing comment within the 15-minute window.
 * Re-resolves mentions; new mentions trigger COMMENT_MENTION notifications.
 */
export async function updateBody(
  organizationId: string,
  actor: CommentActor,
  commentId: string,
  input: UpdateCommentInput,
): Promise<CommentWithAuthor> {
  const existing = await prisma.comment.findFirst({
    where: { id: commentId, organizationId, deletedAt: null },
    select: {
      id: true,
      authorId: true,
      estimateId: true,
      createdAt: true,
      body: true,
      estimate: { select: { id: true, title: true } },
    },
  });
  if (!existing) throw new NotFoundError('Comment', commentId);

  if (existing.authorId !== actor.id) {
    throw new ForbiddenError('Only the author can edit this comment');
  }
  const ageMs = Date.now() - existing.createdAt.getTime();
  if (ageMs > EDIT_WINDOW_MS) {
    throw new ConflictError(
      'Comment can no longer be edited (15-minute window has passed)',
      'edit_window_expired',
      { ageMs, windowMs: EDIT_WINDOW_MS },
    );
  }

  const body = input.body.trim();
  if (body.length === 0) {
    throw new ValidationError('Comment body cannot be empty', {
      issues: [{ path: 'body', message: 'Required' }],
    });
  }
  if (body.length > BODY_MAX) {
    throw new ValidationError(`Comment is too long (max ${BODY_MAX} chars)`, {
      issues: [{ path: 'body', message: 'Too long' }],
    });
  }

  const newMentions = await resolveMentions(organizationId, actor.id, input.mentions);

  // Determine which mentions are actually new (avoid re-notifying everyone
  // every time someone tweaks a typo).
  const previouslyMentioned = await previousMentionUserIds(organizationId, commentId);
  const freshMentions = newMentions.filter((id) => !previouslyMentioned.has(id));

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { body, lastEditedAt: new Date() },
    include: withAuthor(),
  });

  if (freshMentions.length > 0) {
    await notifyMentions({
      organizationId,
      estimateId: existing.estimateId,
      estimateTitle: existing.estimate.title,
      commentId,
      body,
      actor,
      mentionedUserIds: freshMentions,
    });
  }

  return updated;
}

async function loadCommentOrThrow(
  organizationId: string,
  commentId: string,
): Promise<{
  id: string;
  authorId: string;
  estimateId: string;
  isResolved: boolean;
  estimate: { reviewerId: string | null };
}> {
  const c = await prisma.comment.findFirst({
    where: { id: commentId, organizationId, deletedAt: null },
    select: {
      id: true,
      authorId: true,
      estimateId: true,
      isResolved: true,
      estimate: { select: { reviewerId: true } },
    },
  });
  if (!c) throw new NotFoundError('Comment', commentId);
  return c;
}

export async function setResolved(
  organizationId: string,
  actor: CommentActor,
  commentId: string,
  resolved: boolean,
): Promise<CommentWithAuthor> {
  const c = await loadCommentOrThrow(organizationId, commentId);
  const isAuthor = c.authorId === actor.id;
  const isReviewer = c.estimate.reviewerId === actor.id;
  if (!isAuthor && !isReviewer && !ADMIN_ROLES.has(actor.role)) {
    throw new ForbiddenError('You cannot resolve this comment');
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.comment.update({
      where: { id: c.id },
      data: {
        isResolved: resolved,
        resolvedById: resolved ? actor.id : null,
        resolvedAt: resolved ? new Date() : null,
      },
      include: withAuthor(),
    });
    if (resolved && !c.isResolved) {
      await tx.activityEvent.create({
        data: {
          organizationId,
          actorId: actor.id,
          eventType: 'COMMENT_RESOLVED',
          entityType: 'Comment',
          entityId: c.id,
          estimateId: c.estimateId,
          summary: 'Resolved a comment',
          meta: { commentId: c.id },
        },
      });
    }
    return updated;
  });
}

export async function softDelete(
  organizationId: string,
  actor: CommentActor,
  commentId: string,
): Promise<void> {
  const c = await loadCommentOrThrow(organizationId, commentId);
  if (c.authorId !== actor.id && !ADMIN_ROLES.has(actor.role)) {
    throw new ForbiddenError('You cannot delete this comment');
  }
  await prisma.comment.update({
    where: { id: c.id },
    data: { deletedAt: new Date() },
  });
}

// ─── Mentions ────────────────────────────────────────────────────────────

async function resolveMentions(
  organizationId: string,
  actorId: string,
  raw: string[] | undefined,
): Promise<string[]> {
  if (!raw || raw.length === 0) return [];
  const unique = Array.from(new Set(raw)).filter((id) => id && id !== actorId);
  if (unique.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      id: { in: unique },
      organizationId,
      deletedAt: null,
      isActive: true,
    },
    select: { id: true },
  });
  // Drop any IDs that didn't validate. We don't error on bad IDs because
  // the typical case is "user was deactivated between mention pick and submit"
  // which shouldn't fail the comment post.
  return users.map((u) => u.id);
}

async function previousMentionUserIds(
  organizationId: string,
  commentId: string,
): Promise<Set<string>> {
  const rows = await prisma.notification.findMany({
    where: {
      organizationId,
      type: 'COMMENT_MENTION',
      entityType: 'Comment',
      entityId: commentId,
    },
    select: { recipientId: true },
  });
  return new Set(rows.map((r) => r.recipientId));
}

interface NotifyMentionsArgs {
  organizationId: string;
  estimateId: string;
  estimateTitle: string;
  commentId: string;
  body: string;
  actor: CommentActor;
  mentionedUserIds: string[];
}

async function notifyMentions(args: NotifyMentionsArgs): Promise<void> {
  if (args.mentionedUserIds.length === 0) return;
  const author = await prisma.user.findFirst({
    where: { id: args.actor.id },
    select: { firstName: true, lastName: true },
  });
  const authorName = author
    ? `${author.firstName} ${author.lastName}`.trim() || 'A teammate'
    : 'A teammate';
  // notify is best-effort and never throws — wrap defensively anyway.
  await Promise.allSettled(
    args.mentionedUserIds.map((recipientId) =>
      notify({
        organizationId: args.organizationId,
        recipientId,
        type: 'COMMENT_MENTION',
        title: `${authorName} mentioned you on "${args.estimateTitle}"`,
        body: args.body.length > 240 ? `${args.body.slice(0, 237)}…` : args.body,
        entityType: 'Comment',
        entityId: args.commentId,
      }).catch((err) => {
        logger.warn({ err, recipientId }, '[comment notify] mention dispatch failed');
        return null;
      }),
    ),
  );
}

export const __forTesting = { EDIT_WINDOW_MS };
