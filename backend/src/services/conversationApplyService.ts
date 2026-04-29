/**
 * Apply structured proposed actions emitted by an ASK_FOLLOWUP run.
 *
 * Reads the run's outputs.proposedActions, validates each action against
 * the current estimate state, and applies them via the existing line
 * item / scope section services so all the markup-cascade + total-recompute
 * logic still runs. Idempotent: marks the run with inputs.actionsAppliedAt
 * and refuses a second apply.
 *
 * The whole batch is treated as best-effort sequential — if one action
 * fails (e.g. a line item was deleted in the UI between the AI run and
 * the apply), the remaining actions are not run, but actions already
 * applied stay applied. The response reports which were applied and the
 * id of the failing one.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';
import * as lineItemService from './lineItemService.js';
import * as scopeSectionService from './scopeSectionService.js';
import { canEditEstimate } from '../lib/permissions.js';
import {
  proposedActionSchema,
  type ProposedAction,
} from '../prompts/askFollowup.js';
import { z } from 'zod';

const LOCKED_STATUSES = new Set(['SENT', 'WON', 'LOST']);

interface Actor {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER';
}

export interface ApplyActionResult {
  index: number;
  type: ProposedAction['type'];
  status: 'applied' | 'skipped';
  /** When applied: the id of the new/updated/removed line item or new section. */
  entityId?: string;
}

export interface ApplyActionsResult {
  runId: string;
  applied: ApplyActionResult[];
}

export async function applyForRun(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  runId: string,
): Promise<ApplyActionsResult> {
  const run = await prisma.aIRun.findFirst({
    where: { id: runId, organizationId, estimateId },
  });
  if (!run) throw new NotFoundError('AIRun', runId);

  if (run.runType !== 'ASK_FOLLOWUP') {
    throw new ValidationError('Only ASK_FOLLOWUP runs can have actions applied', {
      code: 'wrong_run_type',
      received: run.runType,
    });
  }
  if (run.status !== 'SUCCEEDED') {
    throw new ConflictError(
      'Cannot apply actions from a run that did not succeed',
      'run_not_succeeded',
      { status: run.status },
    );
  }

  const inputs = (run.inputs ?? {}) as Record<string, unknown>;
  if (typeof inputs.actionsAppliedAt === 'string' && inputs.actionsAppliedAt.length > 0) {
    throw new ConflictError(
      'Actions from this run have already been applied',
      'actions_already_applied',
      { appliedAt: inputs.actionsAppliedAt },
    );
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);

  if (
    !canEditEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status,
      },
    )
  ) {
    throw new ConflictError('You cannot edit this estimate', 'forbidden_edit', {
      role: actor.role,
    });
  }
  if (LOCKED_STATUSES.has(estimate.status)) {
    throw new ConflictError(
      `Cannot apply actions while the estimate is ${estimate.status}`,
      'cannot_edit_in_current_status',
      { status: estimate.status },
    );
  }

  const outputs = (run.outputs ?? {}) as { proposedActions?: unknown };
  const parsed = z.array(proposedActionSchema).safeParse(outputs.proposedActions ?? []);
  if (!parsed.success) {
    throw new ValidationError('Run has malformed proposedActions', {
      code: 'malformed_proposed_actions',
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  const actions = parsed.data;
  if (actions.length === 0) {
    throw new ValidationError('Run has no proposed actions to apply', {
      code: 'no_proposed_actions',
    });
  }

  const applied: ApplyActionResult[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const result = await applyOne(organizationId, actor, estimateId, action).catch((err) => {
      // Mark the run as applied for everything before this and re-throw
      // with the index so the controller can format a useful response.
      if (applied.length > 0) {
        return persistApplied(run.id, applied).then(() => {
          throw err;
        });
      }
      throw err;
    });
    applied.push({ index: i, type: action.type, status: 'applied', entityId: result });
  }

  await persistApplied(run.id, applied);

  return { runId: run.id, applied };
}

async function applyOne(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  action: ProposedAction,
): Promise<string> {
  switch (action.type) {
    case 'ADD_LINE_ITEM': {
      // Verify section belongs to this estimate.
      const section = await prisma.scopeSection.findFirst({
        where: {
          id: action.scopeSectionId,
          organizationId,
          estimateId,
          deletedAt: null,
        },
      });
      if (!section) {
        throw new ValidationError('Proposed scopeSectionId does not belong to this estimate', {
          code: 'unknown_section',
          scopeSectionId: action.scopeSectionId,
        });
      }
      const created = await lineItemService.create(organizationId, actor, estimateId, {
        scopeSectionId: action.scopeSectionId,
        description: action.description,
        quantity: action.quantity,
        unitOfMeasure: action.unitOfMeasure,
        source: 'AI_GENERATED',
        status: 'NEEDS_REVIEW',
        aiAssumption: action.aiAssumption ?? null,
      });
      return created.id;
    }
    case 'UPDATE_LINE_ITEM': {
      const existing = await prisma.lineItem.findFirst({
        where: {
          id: action.lineItemId,
          organizationId,
          estimateId,
          deletedAt: null,
        },
      });
      if (!existing) {
        throw new ValidationError('Proposed lineItemId does not belong to this estimate', {
          code: 'unknown_line_item',
          lineItemId: action.lineItemId,
        });
      }
      const patch: lineItemService.UpdateLineItemInput = {};
      if (action.description !== undefined) patch.description = action.description;
      if (action.quantity !== undefined) patch.quantity = action.quantity;
      if (action.unitOfMeasure !== undefined) patch.unitOfMeasure = action.unitOfMeasure;
      if (action.aiAssumption !== undefined) patch.aiAssumption = action.aiAssumption;
      const updated = await lineItemService.update(organizationId, actor, action.lineItemId, patch);
      return updated.id;
    }
    case 'REMOVE_LINE_ITEM': {
      const existing = await prisma.lineItem.findFirst({
        where: {
          id: action.lineItemId,
          organizationId,
          estimateId,
          deletedAt: null,
        },
      });
      if (!existing) {
        throw new ValidationError('Proposed lineItemId does not belong to this estimate', {
          code: 'unknown_line_item',
          lineItemId: action.lineItemId,
        });
      }
      await lineItemService.softDelete(organizationId, actor, action.lineItemId);
      return action.lineItemId;
    }
    case 'ADD_SECTION': {
      const created = await scopeSectionService.create(organizationId, actor, estimateId, {
        name: action.name,
        description: action.description ?? null,
      });
      return created.id;
    }
  }
}

async function persistApplied(runId: string, applied: ApplyActionResult[]): Promise<void> {
  // Re-load to merge with whatever inputs json was already stored.
  const run = await prisma.aIRun.findUniqueOrThrow({ where: { id: runId } });
  const prev = (run.inputs ?? {}) as Record<string, unknown>;
  const next = {
    ...prev,
    actionsAppliedAt: new Date().toISOString(),
    actionsAppliedSummary: applied.map((a) => ({
      index: a.index,
      type: a.type,
      entityId: a.entityId ?? null,
    })),
  };
  await prisma.aIRun.update({
    where: { id: runId },
    data: { inputs: next as Prisma.InputJsonValue },
  });
}
