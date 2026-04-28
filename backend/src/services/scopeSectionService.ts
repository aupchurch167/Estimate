/**
 * Scope section service.
 *
 * Sections are children of a single Estimate. Editing rules: blocked
 * entirely when the parent estimate is SENT/WON/LOST; allowed for
 * drafter / reviewer / OWNER / ADMIN otherwise.
 */

import type { ScopeSection } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { canEditEstimate } from '../lib/permissions.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';

const LOCKED_STATUSES = new Set(['SENT', 'WON', 'LOST']);

interface Actor {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER';
}

async function loadEstimate(organizationId: string, estimateId: string) {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  return estimate;
}

function assertEditable(
  actor: Actor,
  estimate: { id: string; drafterId: string; reviewerId: string | null; status: string },
): void {
  if (
    !canEditEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: estimate.drafterId,
        reviewerId: estimate.reviewerId,
        status: estimate.status as never,
      },
    )
  ) {
    throw new ForbiddenError('You cannot modify this estimate');
  }
  if (LOCKED_STATUSES.has(estimate.status)) {
    throw new ConflictError(
      `Cannot edit an estimate while it is ${estimate.status}`,
      'cannot_edit_in_current_status',
      { status: estimate.status },
    );
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

export interface CreateSectionInput {
  name: string;
  description?: string | null;
  categoryId?: string | null;
  markupPercent?: string | null;
  order?: number;
}

export async function create(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  input: CreateSectionInput,
): Promise<ScopeSection> {
  const estimate = await loadEstimate(organizationId, estimateId);
  assertEditable(actor, estimate);

  let order = input.order;
  if (order === undefined) {
    const max = await prisma.scopeSection.aggregate({
      where: { estimateId, deletedAt: null },
      _max: { order: true },
    });
    order = (max._max.order ?? -1) + 1;
  }

  return prisma.scopeSection.create({
    data: {
      organizationId,
      estimateId,
      name: input.name,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      markupPercent: input.markupPercent ?? null,
      order,
    },
  });
}

export interface UpdateSectionInput {
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  markupPercent?: string | null;
  order?: number;
}

export async function update(
  organizationId: string,
  actor: Actor,
  id: string,
  patch: UpdateSectionInput,
): Promise<ScopeSection> {
  const section = await prisma.scopeSection.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!section) throw new NotFoundError('ScopeSection', id);
  const estimate = await loadEstimate(organizationId, section.estimateId);
  assertEditable(actor, estimate);
  return prisma.scopeSection.update({ where: { id }, data: patch });
}

export async function softDelete(
  organizationId: string,
  actor: Actor,
  id: string,
): Promise<void> {
  const section = await prisma.scopeSection.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!section) throw new NotFoundError('ScopeSection', id);
  const estimate = await loadEstimate(organizationId, section.estimateId);
  assertEditable(actor, estimate);

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.lineItem.updateMany({
      where: { scopeSectionId: id, deletedAt: null },
      data: { deletedAt: now },
    });
    await tx.scopeSection.update({
      where: { id },
      data: { deletedAt: now },
    });
  });
}

export async function reorder(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  pairs: { id: string; order: number }[],
): Promise<void> {
  const estimate = await loadEstimate(organizationId, estimateId);
  assertEditable(actor, estimate);

  const ids = pairs.map((p) => p.id);
  const sections = await prisma.scopeSection.findMany({
    where: { id: { in: ids }, estimateId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (sections.length !== ids.length) {
    throw new NotFoundError('ScopeSection', ids.join(','));
  }
  await prisma.$transaction(
    pairs.map((p) =>
      prisma.scopeSection.update({
        where: { id: p.id },
        data: { order: p.order },
      }),
    ),
  );
}

// Caller helpers used by sibling services + controllers.
export { LOCKED_STATUSES, loadEstimate, assertEditable };
export type { Actor };
