/**
 * Comment service (Phase 4.2).
 *
 * Flat per-estimate comments with optional line-item attachment and a
 * resolved/unresolved toggle. Threading (parentCommentId) is in the
 * schema but unused at MVP; replies land in a later polish pass.
 *
 * Permissions:
 *   - List: any org member.
 *   - Create: any org member who can edit OR review the estimate, plus
 *     PMs / VIEWERS who shouldn't be silenced. We open creation to any
 *     authenticated org member to keep stakeholders involved; admins can
 *     prune later.
 *   - Resolve / unresolve: the author, the estimate's reviewer, or admin.
 *   - Soft delete: the author or admin.
 */

import type { Comment, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';

const BODY_MAX = 4000;

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
    select: { id: true, reviewerId: true },
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
}

export async function create(
  organizationId: string,
  actor: CommentActor,
  estimateId: string,
  input: CreateCommentInput,
): Promise<CommentWithAuthor> {
  await loadEstimateOrThrow(organizationId, estimateId);
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

  return prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        organizationId,
        estimateId,
        lineItemId: input.lineItemId ?? null,
        authorId: actor.id,
        body,
      },
      include: withAuthor(),
    });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'COMMENT_ADDED',
        entityType: 'Comment',
        entityId: created.id,
        estimateId,
        summary: input.lineItemId
          ? 'Added a comment on a line item'
          : 'Added a comment',
        meta: { commentId: created.id, lineItemId: input.lineItemId ?? null },
      },
    });
    return created;
  });
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
