/**
 * Estimate review-workflow state machine (Phase 4.1).
 *
 * State transitions:
 *   DRAFT | REVISED  --submit-->  IN_REVIEW
 *   IN_REVIEW        --approve--> APPROVED
 *   IN_REVIEW        --request--> REVISED
 *   APPROVED         --unlock-->  REVISED   (admin override)
 *
 * Each transition atomically:
 *   1. Updates Estimate.status (and reviewerId on submit if provided).
 *   2. Writes a ReviewAction row.
 *   3. Writes an ActivityEvent row.
 *
 * Permissions are enforced before the transaction starts; status guards
 * are enforced inside the transaction with a SELECT to avoid races. We
 * never mutate the row if the status precondition fails.
 *
 * Send / mark won/lost / revise-from-sent live in later phases.
 */

import type { Prisma } from '@prisma/client';
import type {
  ActivityEventType,
  Estimate,
  EstimateStatus,
  ReviewAction,
  ReviewActionType,
  SnapshotType,
  UserRole,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  canCloseOutEstimate,
  canReviewEstimate,
  canSubmitEstimateForReview,
  canUnlockApprovedEstimate,
} from '../lib/permissions.js';
import { createSnapshotInTx } from './snapshotService.js';
import * as notifications from './notificationService.js';

export interface Actor {
  id: string;
  role: UserRole;
}

export interface TransitionResult {
  estimate: Estimate;
  reviewAction: ReviewAction;
}

interface CommonOpts {
  note?: string | null;
  /** Override the assigned reviewer at submit time. */
  reviewerId?: string | null;
}

const NOTE_MAX = 2000;

function trimNote(note: string | null | undefined, required: boolean, label: string): string | null {
  const trimmed = (note ?? '').trim();
  if (trimmed.length === 0) {
    if (required) {
      throw new ValidationError(`${label} note is required`, {
        issues: [{ path: 'note', message: 'Required' }],
      });
    }
    return null;
  }
  if (trimmed.length > NOTE_MAX) {
    throw new ValidationError(`${label} note is too long (max ${NOTE_MAX} chars)`, {
      issues: [{ path: 'note', message: 'Too long' }],
    });
  }
  return trimmed;
}

async function loadEstimateOrThrow(organizationId: string, estimateId: string): Promise<Estimate> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  return estimate;
}

async function commitTransition(args: {
  organizationId: string;
  actor: Actor;
  estimate: Estimate;
  expectedStatus: ReadonlyArray<EstimateStatus>;
  toStatus: EstimateStatus;
  actionType: ReviewActionType;
  activityType: ActivityEventType;
  summary: string;
  note: string | null;
  reviewerId?: string | null;
  /** Extra columns to set on the estimate alongside status (wonAt, etc.). */
  extraEstimateData?: Prisma.EstimateUpdateInput;
  /** When set, take a snapshot of the post-update estimate state and
   * link its id on the ReviewAction. */
  snapshotType?: SnapshotType;
}): Promise<TransitionResult> {
  return prisma.$transaction(async (tx) => {
    // Re-read inside the tx to enforce the status precondition under a row lock.
    const fresh = await tx.estimate.findFirst({
      where: { id: args.estimate.id, organizationId: args.organizationId, deletedAt: null },
    });
    if (!fresh) throw new NotFoundError('Estimate', args.estimate.id);
    if (!args.expectedStatus.includes(fresh.status)) {
      throw new ConflictError(
        `Cannot ${args.actionType.toLowerCase()} an estimate while it is ${fresh.status}`,
        'invalid_status_transition',
        { from: fresh.status, expected: args.expectedStatus, attempted: args.toStatus },
      );
    }

    const data: Prisma.EstimateUpdateInput = {
      status: args.toStatus,
      ...(args.extraEstimateData ?? {}),
    };
    if (args.reviewerId !== undefined) {
      data.reviewer = args.reviewerId
        ? { connect: { id: args.reviewerId } }
        : { disconnect: true };
    }

    const next = await tx.estimate.update({
      where: { id: fresh.id },
      data,
    });

    let snapshotId: string | undefined;
    if (args.snapshotType) {
      const snap = await createSnapshotInTx(tx, {
        organizationId: args.organizationId,
        estimateId: fresh.id,
        userId: args.actor.id,
        snapshotType: args.snapshotType,
      });
      snapshotId = snap.id;
    }

    const reviewAction = await tx.reviewAction.create({
      data: {
        organizationId: args.organizationId,
        estimateId: fresh.id,
        actorId: args.actor.id,
        actionType: args.actionType,
        note: args.note,
        fromStatus: fresh.status,
        toStatus: args.toStatus,
        snapshotId,
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: args.organizationId,
        actorId: args.actor.id,
        eventType: args.activityType,
        entityType: 'Estimate',
        entityId: fresh.id,
        estimateId: fresh.id,
        summary: args.summary,
        meta: {
          fromStatus: fresh.status,
          toStatus: args.toStatus,
          ...(args.note ? { note: args.note } : {}),
          ...(snapshotId ? { snapshotId } : {}),
        },
      },
    });

    return { estimate: next, reviewAction };
  });
}

// ─── Submit for review ────────────────────────────────────────────────────

export async function submitForReview(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  opts: CommonOpts = {},
): Promise<TransitionResult> {
  const estimate = await loadEstimateOrThrow(organizationId, estimateId);

  if (
    !canSubmitEstimateForReview(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
    )
  ) {
    throw new ForbiddenError('You cannot submit this estimate for review');
  }

  const note = trimNote(opts.note, false, 'Submission');

  // If a reviewerId override is provided, validate it belongs to the org.
  let reviewerOverride: string | null | undefined;
  if (opts.reviewerId !== undefined) {
    if (opts.reviewerId === null) {
      reviewerOverride = null;
    } else {
      const reviewer = await prisma.user.findFirst({
        where: {
          id: opts.reviewerId,
          organizationId,
          deletedAt: null,
          isActive: true,
        },
      });
      if (!reviewer) {
        throw new ValidationError('Reviewer not found in this organization', {
          issues: [{ path: 'reviewerId', message: 'Not found' }],
        });
      }
      reviewerOverride = reviewer.id;
    }
  }

  const isResubmit = estimate.status === 'REVISED';

  const result = await commitTransition({
    organizationId,
    actor,
    estimate,
    expectedStatus: ['DRAFT', 'REVISED'],
    toStatus: 'IN_REVIEW',
    actionType: isResubmit ? 'RESUBMITTED' : 'SUBMITTED_FOR_REVIEW',
    activityType: 'ESTIMATE_SUBMITTED_FOR_REVIEW',
    summary: isResubmit
      ? `Resubmitted estimate ${estimate.number} for review`
      : `Submitted estimate ${estimate.number} for review`,
    note,
    reviewerId: reviewerOverride,
  });

  // Notify the assigned reviewer (post-update reviewerId, in case of override).
  const reviewerId = result.estimate.reviewerId;
  if (reviewerId && reviewerId !== actor.id) {
    const drafterName = await actorDisplayName(actor.id);
    void notifications.notify({
      organizationId,
      recipientId: reviewerId,
      type: 'REVIEW_REQUESTED',
      title: isResubmit
        ? `Estimate ${estimate.number} resubmitted for review`
        : `Estimate ${estimate.number} submitted for review`,
      body: note ?? null,
      entityType: 'Estimate',
      entityId: estimate.id,
      templateData: {
        template: 'REVIEW_REQUESTED',
        drafterName,
        estimateNumber: estimate.number,
        estimateTitle: estimate.title,
        estimateId: estimate.id,
        isResubmit,
        note: note ?? null,
      },
    });
  }

  return result;
}

// ─── Approve ──────────────────────────────────────────────────────────────

export async function approve(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  opts: CommonOpts = {},
): Promise<TransitionResult> {
  const estimate = await loadEstimateOrThrow(organizationId, estimateId);

  if (
    !canReviewEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
    )
  ) {
    throw new ForbiddenError('You cannot approve this estimate');
  }

  const note = trimNote(opts.note, false, 'Approval');

  const result = await commitTransition({
    organizationId,
    actor,
    estimate,
    expectedStatus: ['IN_REVIEW'],
    toStatus: 'APPROVED',
    actionType: 'APPROVED',
    activityType: 'ESTIMATE_APPROVED',
    summary: `Approved estimate ${estimate.number}`,
    note,
    snapshotType: 'APPROVAL',
  });

  // Notify the drafter that their estimate was approved.
  if (estimate.drafterId !== actor.id) {
    const reviewerName = await actorDisplayName(actor.id);
    void notifications.notify({
      organizationId,
      recipientId: estimate.drafterId,
      type: 'REVIEW_APPROVED',
      title: `Estimate ${estimate.number} approved`,
      body: note ?? null,
      entityType: 'Estimate',
      entityId: estimate.id,
      templateData: {
        template: 'REVIEW_APPROVED',
        reviewerName,
        estimateNumber: estimate.number,
        estimateTitle: estimate.title,
        estimateId: estimate.id,
        note: note ?? null,
      },
    });
  }

  return result;
}

// ─── Request changes ──────────────────────────────────────────────────────

export async function requestChanges(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  opts: { note: string },
): Promise<TransitionResult> {
  const estimate = await loadEstimateOrThrow(organizationId, estimateId);

  if (
    !canReviewEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
    )
  ) {
    throw new ForbiddenError('You cannot request changes on this estimate');
  }

  const note = trimNote(opts.note, true, 'Change-request');

  const result = await commitTransition({
    organizationId,
    actor,
    estimate,
    expectedStatus: ['IN_REVIEW'],
    toStatus: 'REVISED',
    actionType: 'REQUESTED_CHANGES',
    activityType: 'ESTIMATE_CHANGES_REQUESTED',
    summary: `Requested changes on estimate ${estimate.number}`,
    note,
  });

  if (estimate.drafterId !== actor.id) {
    const reviewerName = await actorDisplayName(actor.id);
    void notifications.notify({
      organizationId,
      recipientId: estimate.drafterId,
      type: 'REVIEW_CHANGES_REQUESTED',
      title: `Changes requested on estimate ${estimate.number}`,
      body: note,
      entityType: 'Estimate',
      entityId: estimate.id,
      templateData: {
        template: 'REVIEW_CHANGES_REQUESTED',
        reviewerName,
        estimateNumber: estimate.number,
        estimateTitle: estimate.title,
        estimateId: estimate.id,
        note: note ?? '',
      },
    });
  }

  return result;
}

async function actorDisplayName(userId: string): Promise<string> {
  const u = await prisma.user.findFirst({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!u) return 'A teammate';
  const full = `${u.firstName} ${u.lastName}`.trim();
  return full || u.email;
}

// ─── Unlock approved ──────────────────────────────────────────────────────

export async function unlock(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  opts: CommonOpts = {},
): Promise<TransitionResult> {
  const estimate = await loadEstimateOrThrow(organizationId, estimateId);

  if (!canUnlockApprovedEstimate(actor.role)) {
    throw new ForbiddenError('Only admins can unlock an approved estimate');
  }
  if (estimate.status !== 'APPROVED') {
    throw new ConflictError(
      `Cannot unlock an estimate while it is ${estimate.status}`,
      'invalid_status_transition',
      { from: estimate.status, expected: ['APPROVED'], attempted: 'REVISED' },
    );
  }

  const note = trimNote(opts.note, false, 'Unlock');

  return commitTransition({
    organizationId,
    actor,
    estimate,
    expectedStatus: ['APPROVED'],
    toStatus: 'REVISED',
    actionType: 'UNLOCKED',
    activityType: 'ESTIMATE_UPDATED',
    summary: `Unlocked estimate ${estimate.number} for revision`,
    note,
    snapshotType: 'REVISION',
  });
}

// ─── Close-out (Phase 4.7) ────────────────────────────────────────────────
//
// SENT → WON / LOST / REVISED. Drives the "Mark won / Mark lost /
// Revise" buttons in the read-only review-mode header.

export async function markWon(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  opts: CommonOpts = {},
): Promise<TransitionResult> {
  const estimate = await loadEstimateOrThrow(organizationId, estimateId);
  if (
    !canCloseOutEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
    )
  ) {
    throw new ForbiddenError('You cannot close out this estimate');
  }
  const note = trimNote(opts.note, false, 'Mark-won');
  const result = await commitTransition({
    organizationId,
    actor,
    estimate,
    expectedStatus: ['SENT'],
    toStatus: 'WON',
    actionType: 'APPROVED', // Re-uses APPROVED ReviewActionType — no WON enum value.
    activityType: 'ESTIMATE_WON',
    summary: `Marked estimate ${estimate.number} as won`,
    note,
    extraEstimateData: { wonAt: new Date() },
  });

  // Notify the drafter (and reviewer if different) — celebratory.
  for (const recipientId of uniqueOthers([estimate.drafterId, estimate.reviewerId], actor.id)) {
    void notifications.notify({
      organizationId,
      recipientId,
      type: 'ESTIMATE_WON',
      title: `Estimate ${estimate.number} marked as won`,
      body: note ?? null,
      entityType: 'Estimate',
      entityId: estimate.id,
    });
  }

  return result;
}

export interface MarkLostOpts extends CommonOpts {
  lostReason: string;
}

export async function markLost(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  opts: MarkLostOpts,
): Promise<TransitionResult> {
  const estimate = await loadEstimateOrThrow(organizationId, estimateId);
  if (
    !canCloseOutEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
    )
  ) {
    throw new ForbiddenError('You cannot close out this estimate');
  }
  const lostReason = trimNote(opts.lostReason, true, 'Lost-reason');
  const note = trimNote(opts.note, false, 'Mark-lost');
  const result = await commitTransition({
    organizationId,
    actor,
    estimate,
    expectedStatus: ['SENT'],
    toStatus: 'LOST',
    actionType: 'REQUESTED_CHANGES', // Closest existing ReviewActionType.
    activityType: 'ESTIMATE_LOST',
    summary: `Marked estimate ${estimate.number} as lost: ${lostReason}`,
    note,
    extraEstimateData: { lostAt: new Date(), lostReason },
  });

  for (const recipientId of uniqueOthers([estimate.drafterId, estimate.reviewerId], actor.id)) {
    void notifications.notify({
      organizationId,
      recipientId,
      type: 'ESTIMATE_LOST',
      title: `Estimate ${estimate.number} marked as lost`,
      body: lostReason,
      entityType: 'Estimate',
      entityId: estimate.id,
    });
  }

  return result;
}

function uniqueOthers(ids: (string | null)[], excludeId: string): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    if (id && id !== excludeId) out.add(id);
  }
  return [...out];
}

export async function reviseFromSent(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  opts: CommonOpts = {},
): Promise<TransitionResult> {
  const estimate = await loadEstimateOrThrow(organizationId, estimateId);
  if (
    !canCloseOutEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
    )
  ) {
    throw new ForbiddenError('You cannot revise this estimate');
  }
  const note = trimNote(opts.note, false, 'Revise');
  return commitTransition({
    organizationId,
    actor,
    estimate,
    expectedStatus: ['SENT'],
    toStatus: 'REVISED',
    actionType: 'REVISED',
    activityType: 'ESTIMATE_REVISED',
    summary: `Revised estimate ${estimate.number} after send`,
    note,
    snapshotType: 'REVISION',
  });
}

// ─── Read helpers ─────────────────────────────────────────────────────────

export async function listReviewActions(
  organizationId: string,
  estimateId: string,
): Promise<ReviewAction[]> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  return prisma.reviewAction.findMany({
    where: { organizationId, estimateId },
    orderBy: { createdAt: 'asc' },
  });
}
