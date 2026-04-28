/**
 * Estimate service.
 *
 * Phase 2.8 covers the estimate shell: list / create / get / update /
 * softDelete + auto-number generation + totals recomputation. State
 * transitions (submit, approve, …) land in 4.1; line item CRUD in 2.11.
 */

import {
  Prisma,
  type Estimate,
  type EstimateStatus,
  type LineItem,
  type ScopeSection,
  type SourceInput,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { canDeleteEstimate, canEditEstimate } from '../lib/permissions.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const NUMBER_RETRY_LIMIT = 5;

const EDITABLE_STATUSES: ReadonlySet<EstimateStatus> = new Set(['DRAFT', 'REVISED']);

// ─── Number generation ────────────────────────────────────────────────────

function yearTwo(d: Date = new Date()): string {
  return String(d.getFullYear() % 100).padStart(2, '0');
}

export async function generateNumber(organizationId: string): Promise<string> {
  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
  });
  if (!settings) throw new NotFoundError('OrgSettings', organizationId);

  const prefix = settings.estimateNumberPrefix;
  const yearPrefix = `${prefix}-${yearTwo()}-`;

  const last = await prisma.estimate.findFirst({
    where: { organizationId, number: { startsWith: yearPrefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  let next = 1;
  if (last) {
    const tail = last.number.slice(yearPrefix.length);
    const parsed = Number.parseInt(tail, 10);
    if (Number.isFinite(parsed)) next = parsed + 1;
  }
  return `${yearPrefix}${String(next).padStart(3, '0')}`;
}

// ─── List ──────────────────────────────────────────────────────────────────

export interface ListEstimateOptions {
  status?: EstimateStatus | EstimateStatus[];
  drafterId?: string;
  reviewerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: 'updatedAt' | 'createdAt' | 'number' | 'totalSellPrice';
  order?: 'asc' | 'desc';
}

export interface PaginatedEstimates {
  data: Estimate[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ESTIMATES_DEFAULT_PAGE_SIZE = 25;
const ESTIMATES_MAX_PAGE_SIZE = 200;

export async function list(
  organizationId: string,
  opts: ListEstimateOptions = {},
): Promise<PaginatedEstimates> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(
    ESTIMATES_MAX_PAGE_SIZE,
    Math.max(1, opts.pageSize ?? ESTIMATES_DEFAULT_PAGE_SIZE),
  );
  const sort = opts.sort ?? 'updatedAt';
  const order = opts.order ?? 'desc';

  const where: Prisma.EstimateWhereInput = {
    organizationId,
    deletedAt: null,
  };
  if (opts.status) {
    where.status = Array.isArray(opts.status) ? { in: opts.status } : opts.status;
  }
  if (opts.drafterId) where.drafterId = opts.drafterId;
  if (opts.reviewerId) where.reviewerId = opts.reviewerId;
  if (opts.search && opts.search.trim().length > 0) {
    const q = opts.search.trim();
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { clientCompanyName: { contains: q, mode: 'insensitive' } },
      { number: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, data] = await prisma.$transaction([
    prisma.estimate.count({ where }),
    prisma.estimate.findMany({
      where,
      orderBy: { [sort]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────

export interface CreateEstimateInput {
  title: string;
  description?: string | null;
  clientCompanyName?: string | null;
  clientContactName?: string | null;
  clientContactEmail?: string | null;
  clientContactPhone?: string | null;
  projectAddressLine1?: string | null;
  projectAddressLine2?: string | null;
  projectCity?: string | null;
  projectState?: string | null;
  projectPostalCode?: string | null;
  validUntil?: string | null;
  reviewerId?: string | null;
}

export async function create(
  organizationId: string,
  drafterId: string,
  input: CreateEstimateInput,
): Promise<Estimate> {
  if (input.reviewerId) {
    const reviewer = await prisma.user.findFirst({
      where: { id: input.reviewerId, organizationId, deletedAt: null, isActive: true },
    });
    if (!reviewer) {
      throw new ValidationError('Reviewer not found in this organization', {
        field: 'reviewerId',
      });
    }
  }

  const baseData: Prisma.EstimateUncheckedCreateInput = {
    organizationId,
    number: '', // filled in the retry loop
    title: input.title,
    description: input.description ?? null,
    drafterId,
    reviewerId: input.reviewerId ?? null,
    clientCompanyName: input.clientCompanyName ?? null,
    clientContactName: input.clientContactName ?? null,
    clientContactEmail: input.clientContactEmail ?? null,
    clientContactPhone: input.clientContactPhone ?? null,
    projectAddressLine1: input.projectAddressLine1 ?? null,
    projectAddressLine2: input.projectAddressLine2 ?? null,
    projectCity: input.projectCity ?? null,
    projectState: input.projectState ?? null,
    projectPostalCode: input.projectPostalCode ?? null,
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
  };

  for (let attempt = 0; attempt < NUMBER_RETRY_LIMIT; attempt++) {
    const number = await generateNumber(organizationId);
    try {
      const estimate = await prisma.$transaction(async (tx) => {
        const created = await tx.estimate.create({ data: { ...baseData, number } });
        await tx.activityEvent.create({
          data: {
            organizationId,
            actorId: drafterId,
            eventType: 'ESTIMATE_CREATED',
            entityType: 'Estimate',
            entityId: created.id,
            estimateId: created.id,
            summary: `Created estimate ${created.number}`,
          },
        });
        return created;
      });
      return estimate;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray(err.meta?.target) &&
        err.meta.target.includes('number')
      ) {
        logger.warn(
          { organizationId, attempt, number },
          'estimate number collision — retrying',
        );
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `Could not allocate a unique estimate number after ${NUMBER_RETRY_LIMIT} attempts`,
  );
}

// ─── Get ──────────────────────────────────────────────────────────────────

export interface EstimateWithRelations extends Estimate {
  scopeSections: ScopeSection[];
  lineItems: LineItem[];
  sourceInputs: SourceInput[];
  conversation: { id: string } | null;
}

export async function getById(
  organizationId: string,
  id: string,
): Promise<EstimateWithRelations> {
  const estimate = await prisma.estimate.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: {
      scopeSections: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
      },
      lineItems: {
        where: { deletedAt: null },
        orderBy: [{ scopeSectionId: 'asc' }, { order: 'asc' }],
      },
      sourceInputs: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      },
      conversation: { select: { id: true } },
    },
  });
  if (!estimate) throw new NotFoundError('Estimate', id);
  return estimate;
}

// ─── Update ──────────────────────────────────────────────────────────────

export interface UpdateEstimateInput {
  title?: string;
  description?: string | null;
  reviewerId?: string | null;
  clientCompanyName?: string | null;
  clientContactName?: string | null;
  clientContactEmail?: string | null;
  clientContactPhone?: string | null;
  projectAddressLine1?: string | null;
  projectAddressLine2?: string | null;
  projectCity?: string | null;
  projectState?: string | null;
  projectPostalCode?: string | null;
  validUntil?: string | null;
}

export async function update(
  organizationId: string,
  actor: { id: string; role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER' },
  id: string,
  patch: UpdateEstimateInput,
): Promise<Estimate> {
  const existing = await prisma.estimate.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError('Estimate', id);

  if (
    !canEditEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: existing.drafterId,
        reviewerId: existing.reviewerId,
        status: existing.status,
      },
    )
  ) {
    throw new ForbiddenError('You cannot edit this estimate');
  }

  if (!EDITABLE_STATUSES.has(existing.status)) {
    throw new ConflictError(
      `Cannot edit an estimate while it is ${existing.status}`,
      'cannot_edit_in_current_status',
      { status: existing.status },
    );
  }

  if (patch.reviewerId !== undefined && patch.reviewerId !== null) {
    const reviewer = await prisma.user.findFirst({
      where: { id: patch.reviewerId, organizationId, deletedAt: null, isActive: true },
    });
    if (!reviewer) {
      throw new ValidationError('Reviewer not found in this organization', {
        field: 'reviewerId',
      });
    }
  }

  const data: Prisma.EstimateUpdateInput = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === 'validUntil') {
      (data as Record<string, unknown>)[key] = value === null ? null : new Date(value as string);
      continue;
    }
    (data as Record<string, unknown>)[key] = value;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.estimate.update({ where: { id }, data });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'ESTIMATE_UPDATED',
        entityType: 'Estimate',
        entityId: next.id,
        estimateId: next.id,
        summary: `Updated estimate ${next.number}`,
        meta: { fields: Object.keys(patch) },
      },
    });
    return next;
  });
  return updated;
}

// ─── Soft delete ──────────────────────────────────────────────────────────

export async function softDelete(
  organizationId: string,
  actor: { id: string; role: 'OWNER' | 'ADMIN' | 'ESTIMATOR' | 'PM' | 'VIEWER' },
  id: string,
): Promise<void> {
  const existing = await prisma.estimate.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError('Estimate', id);

  if (
    !canDeleteEstimate(
      { id: actor.id, role: actor.role },
      {
        drafterId: existing.drafterId,
        reviewerId: existing.reviewerId,
        status: existing.status,
      },
    )
  ) {
    throw new ForbiddenError('You cannot delete this estimate');
  }

  await prisma.$transaction(async (tx) => {
    await tx.estimate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await tx.activityEvent.create({
      data: {
        organizationId,
        actorId: actor.id,
        eventType: 'ESTIMATE_DELETED',
        entityType: 'Estimate',
        entityId: id,
        estimateId: id,
        summary: `Deleted estimate ${existing.number}`,
      },
    });
  });
}

// ─── Totals ───────────────────────────────────────────────────────────────

/**
 * Recompute totalCost / totalMarkup / totalSellPrice from active line items.
 * Called by line-item CRUD in 2.11. Safe to run any time — it never reads
 * snapshots, so estimates already in SENT/WON/LOST are unaffected by the
 * caller policy (the caller is responsible for skipping locked statuses).
 */
export async function recomputeTotals(estimateId: string): Promise<void> {
  const lineItems = await prisma.lineItem.findMany({
    where: { estimateId, deletedAt: null },
    select: { lineCost: true, lineSellPrice: true },
  });
  let totalCost = new Prisma.Decimal(0);
  let totalSell = new Prisma.Decimal(0);
  for (const li of lineItems) {
    totalCost = totalCost.plus(li.lineCost);
    totalSell = totalSell.plus(li.lineSellPrice);
  }
  const totalMarkup = totalSell.minus(totalCost);
  await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      totalCost,
      totalMarkup,
      totalSellPrice: totalSell,
    },
  });
}
