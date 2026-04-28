/**
 * Line item service.
 *
 * Owns CRUD for LineItem inside a ScopeSection plus the bulk update path.
 * lineCost / lineSellPrice are computed server-side from quantity +
 * unit costs + resolved markup. Every CRUD path recomputes parent
 * Estimate totals and (for line items linked to a PriceBookEntry) bumps
 * the entry's usageCount + lastUsedAt atomically.
 */

import {
  Prisma,
  type LineItem,
  type LineItemSource,
  type LineItemStatus,
  type UnitOfMeasure,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { resolveMarkup, type MarkupRuleSlim } from '../lib/markup.js';
import { recomputeTotals } from './estimateService.js';
import {
  assertEditable,
  loadEstimate,
  type Actor,
} from './scopeSectionService.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function decimal(value: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (value === null || value === undefined || value === '') return new Prisma.Decimal(0);
  return new Prisma.Decimal(value as Prisma.Decimal.Value);
}

function computeLineMath(opts: {
  quantity: string;
  unitCostMaterial: string;
  unitCostLabor: string;
  markupPercent: string;
}): { lineCost: Prisma.Decimal; lineSellPrice: Prisma.Decimal } {
  const qty = decimal(opts.quantity);
  const unit = decimal(opts.unitCostMaterial).plus(decimal(opts.unitCostLabor));
  const lineCost = qty.times(unit);
  const lineSellPrice = lineCost.times(new Prisma.Decimal(1).plus(decimal(opts.markupPercent)));
  return {
    lineCost: lineCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    lineSellPrice: lineSellPrice.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  };
}

async function loadResolutionContext(opts: {
  organizationId: string;
  estimateId: string;
  scopeSectionId: string;
  priceBookEntryId?: string | null;
}) {
  const [section, settings, markupRules, priceBookEntry] = await Promise.all([
    prisma.scopeSection.findFirst({
      where: { id: opts.scopeSectionId, organizationId: opts.organizationId, deletedAt: null },
      include: { category: true },
    }),
    prisma.orgSettings.findUnique({ where: { organizationId: opts.organizationId } }),
    prisma.markupRule.findMany({
      where: { organizationId: opts.organizationId, isActive: true, deletedAt: null },
    }),
    opts.priceBookEntryId
      ? prisma.priceBookEntry.findFirst({
          where: {
            id: opts.priceBookEntryId,
            organizationId: opts.organizationId,
            deletedAt: null,
          },
          include: { category: true },
        })
      : Promise.resolve(null),
  ]);

  if (!section) throw new NotFoundError('ScopeSection', opts.scopeSectionId);
  if (!settings) throw new NotFoundError('OrgSettings', opts.organizationId);

  const category = section.category ?? priceBookEntry?.category ?? null;

  return {
    section,
    settings,
    markupRules: markupRules as MarkupRuleSlim[],
    category,
    priceBookEntry,
  };
}

async function bumpUsage(tx: Prisma.TransactionClient, priceBookEntryId: string): Promise<void> {
  await tx.priceBookEntry.update({
    where: { id: priceBookEntryId },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

// ─── Create ───────────────────────────────────────────────────────────────

export interface CreateLineItemInput {
  scopeSectionId: string;
  description: string;
  quantity?: string;
  unitOfMeasure: UnitOfMeasure;
  customUnitOfMeasure?: string | null;
  unitCostMaterial?: string;
  unitCostLabor?: string;
  markupPercent?: string | null;
  priceBookEntryId?: string | null;
  source?: LineItemSource;
  status?: LineItemStatus;
  aiConfidence?: string | null;
  aiAssumption?: string | null;
  internalNotes?: string | null;
  clientNotes?: string | null;
  order?: number;
}

export async function create(
  organizationId: string,
  actor: Actor,
  estimateId: string,
  input: CreateLineItemInput,
): Promise<LineItem> {
  const estimate = await loadEstimate(organizationId, estimateId);
  assertEditable(actor, estimate);

  const ctx = await loadResolutionContext({
    organizationId,
    estimateId,
    scopeSectionId: input.scopeSectionId,
    priceBookEntryId: input.priceBookEntryId,
  });

  if (ctx.section.estimateId !== estimateId) {
    throw new ValidationError('Scope section belongs to a different estimate', {
      field: 'scopeSectionId',
    });
  }

  // Snapshot pricing from PriceBookEntry when present, but never override
  // values explicitly provided by the caller.
  const unitCostMaterial =
    input.unitCostMaterial ??
    (ctx.priceBookEntry ? String(ctx.priceBookEntry.unitCostMaterial) : '0');
  const unitCostLabor =
    input.unitCostLabor ?? (ctx.priceBookEntry ? String(ctx.priceBookEntry.unitCostLabor) : '0');
  const quantity = input.quantity ?? '1';

  const resolvedMarkup = resolveMarkup({
    lineMarkup: input.markupPercent,
    lineDescription: input.description,
    section: { name: ctx.section.name, markupPercent: ctx.section.markupPercent?.toString() },
    category: ctx.category
      ? {
          id: ctx.category.id,
          name: ctx.category.name,
          defaultMarkupPercent: ctx.category.defaultMarkupPercent?.toString(),
        }
      : null,
    orgSettings: { defaultMarkupPercent: ctx.settings.defaultMarkupPercent?.toString() },
    markupRules: ctx.markupRules,
  });

  const { lineCost, lineSellPrice } = computeLineMath({
    quantity,
    unitCostMaterial,
    unitCostLabor,
    markupPercent: resolvedMarkup,
  });

  let order = input.order;
  if (order === undefined) {
    const max = await prisma.lineItem.aggregate({
      where: { scopeSectionId: input.scopeSectionId, deletedAt: null },
      _max: { order: true },
    });
    order = (max._max.order ?? -1) + 1;
  }

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.lineItem.create({
      data: {
        organizationId,
        estimateId,
        scopeSectionId: input.scopeSectionId,
        priceBookEntryId: input.priceBookEntryId ?? null,
        description: input.description,
        quantity,
        unitOfMeasure: input.unitOfMeasure,
        customUnitOfMeasure: input.customUnitOfMeasure ?? null,
        unitCostMaterial,
        unitCostLabor,
        markupPercent: resolvedMarkup,
        lineCost,
        lineSellPrice,
        status: input.status ?? 'DRAFT',
        source: input.source ?? 'MANUAL',
        aiConfidence: input.aiConfidence ?? null,
        aiAssumption: input.aiAssumption ?? null,
        internalNotes: input.internalNotes ?? null,
        clientNotes: input.clientNotes ?? null,
        order: order!,
      },
    });
    if (input.priceBookEntryId) await bumpUsage(tx, input.priceBookEntryId);
    return item;
  });

  await recomputeTotals(estimateId);
  return created;
}

// ─── Update ───────────────────────────────────────────────────────────────

export interface UpdateLineItemInput {
  description?: string;
  quantity?: string;
  unitOfMeasure?: UnitOfMeasure;
  customUnitOfMeasure?: string | null;
  unitCostMaterial?: string;
  unitCostLabor?: string;
  markupPercent?: string | null;
  status?: LineItemStatus;
  aiAssumption?: string | null;
  internalNotes?: string | null;
  clientNotes?: string | null;
  order?: number;
  scopeSectionId?: string;
}

export async function update(
  organizationId: string,
  actor: Actor,
  id: string,
  patch: UpdateLineItemInput,
): Promise<LineItem> {
  const existing = await prisma.lineItem.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError('LineItem', id);
  const estimate = await loadEstimate(organizationId, existing.estimateId);
  assertEditable(actor, estimate);

  const sectionId = patch.scopeSectionId ?? existing.scopeSectionId;
  if (patch.scopeSectionId && patch.scopeSectionId !== existing.scopeSectionId) {
    const newSection = await prisma.scopeSection.findFirst({
      where: {
        id: patch.scopeSectionId,
        organizationId,
        estimateId: existing.estimateId,
        deletedAt: null,
      },
    });
    if (!newSection) throw new NotFoundError('ScopeSection', patch.scopeSectionId);
  }

  const ctx = await loadResolutionContext({
    organizationId,
    estimateId: existing.estimateId,
    scopeSectionId: sectionId,
    priceBookEntryId: existing.priceBookEntryId,
  });

  const quantity = patch.quantity ?? existing.quantity.toString();
  const unitCostMaterial = patch.unitCostMaterial ?? existing.unitCostMaterial.toString();
  const unitCostLabor = patch.unitCostLabor ?? existing.unitCostLabor.toString();
  // markupPercent stays as-is unless explicitly patched. Setting it to null
  // re-runs the cascade.
  const explicit = patch.markupPercent !== undefined ? patch.markupPercent : existing.markupPercent.toString();
  const markupPercent =
    patch.markupPercent === null
      ? resolveMarkup({
          lineMarkup: null,
          lineDescription: patch.description ?? existing.description,
          section: { name: ctx.section.name, markupPercent: ctx.section.markupPercent?.toString() },
          category: ctx.category
            ? {
                id: ctx.category.id,
                name: ctx.category.name,
                defaultMarkupPercent: ctx.category.defaultMarkupPercent?.toString(),
              }
            : null,
          orgSettings: { defaultMarkupPercent: ctx.settings.defaultMarkupPercent?.toString() },
          markupRules: ctx.markupRules,
        })
      : explicit ?? '0';

  const { lineCost, lineSellPrice } = computeLineMath({
    quantity,
    unitCostMaterial,
    unitCostLabor,
    markupPercent: markupPercent.toString(),
  });

  const data: Prisma.LineItemUpdateInput = {
    quantity,
    unitCostMaterial,
    unitCostLabor,
    markupPercent: markupPercent.toString(),
    lineCost,
    lineSellPrice,
  };
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.unitOfMeasure !== undefined) data.unitOfMeasure = patch.unitOfMeasure;
  if (patch.customUnitOfMeasure !== undefined) data.customUnitOfMeasure = patch.customUnitOfMeasure;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.aiAssumption !== undefined) data.aiAssumption = patch.aiAssumption;
  if (patch.internalNotes !== undefined) data.internalNotes = patch.internalNotes;
  if (patch.clientNotes !== undefined) data.clientNotes = patch.clientNotes;
  if (patch.order !== undefined) data.order = patch.order;
  if (patch.scopeSectionId !== undefined) {
    data.scopeSection = { connect: { id: patch.scopeSectionId } };
  }

  const updated = await prisma.lineItem.update({ where: { id }, data });
  await recomputeTotals(existing.estimateId);
  return updated;
}

// ─── Soft delete ──────────────────────────────────────────────────────────

export async function softDelete(
  organizationId: string,
  actor: Actor,
  id: string,
): Promise<void> {
  const existing = await prisma.lineItem.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError('LineItem', id);
  const estimate = await loadEstimate(organizationId, existing.estimateId);
  assertEditable(actor, estimate);

  await prisma.lineItem.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await recomputeTotals(existing.estimateId);
}

// ─── Bulk operations ──────────────────────────────────────────────────────

export type BulkOperation =
  | { operation: 'delete'; lineItemIds: string[] }
  | {
      operation: 'update';
      lineItemIds: string[];
      payload: Pick<UpdateLineItemInput, 'status' | 'unitCostMaterial' | 'unitCostLabor' | 'markupPercent' | 'unitOfMeasure'>;
    }
  | { operation: 'applyMarkup'; lineItemIds: string[]; payload: { markupPercent: string } };

const BULK_MAX = 500;

export async function bulk(
  organizationId: string,
  actor: Actor,
  op: BulkOperation,
): Promise<{ count: number }> {
  if (op.lineItemIds.length === 0) return { count: 0 };
  if (op.lineItemIds.length > BULK_MAX) {
    throw new ValidationError(`Bulk operations are capped at ${BULK_MAX} items`, {
      code: 'too_many_items',
      received: op.lineItemIds.length,
    });
  }

  const items = await prisma.lineItem.findMany({
    where: { id: { in: op.lineItemIds }, deletedAt: null },
    select: { id: true, organizationId: true, estimateId: true },
  });
  if (items.length !== op.lineItemIds.length) {
    throw new NotFoundError('LineItem', op.lineItemIds.join(','));
  }
  if (items.some((i) => i.organizationId !== organizationId)) {
    throw new ValidationError('Cannot mix line items from another organization', {
      code: 'cross_org_ids',
    });
  }
  const estimateIds = Array.from(new Set(items.map((i) => i.estimateId)));
  // Validate edit permission + status lock for every estimate touched.
  for (const eid of estimateIds) {
    const estimate = await loadEstimate(organizationId, eid);
    assertEditable(actor, estimate);
  }

  switch (op.operation) {
    case 'delete': {
      await prisma.lineItem.updateMany({
        where: { id: { in: op.lineItemIds } },
        data: { deletedAt: new Date() },
      });
      break;
    }
    case 'update':
    case 'applyMarkup': {
      // Per-item update so lineCost/lineSellPrice recompute deterministically.
      for (const id of op.lineItemIds) {
        await update(organizationId, actor, id, {
          ...(op.operation === 'applyMarkup'
            ? { markupPercent: op.payload.markupPercent }
            : op.payload),
        });
      }
      // recomputeTotals already called per-update, but bulk updates touch
      // the same estimate(s) repeatedly — collapse with one final pass.
      for (const eid of estimateIds) await recomputeTotals(eid);
      return { count: op.lineItemIds.length };
    }
  }

  for (const eid of estimateIds) await recomputeTotals(eid);
  return { count: op.lineItemIds.length };
}

// Re-export for tests + downstream services.
export { computeLineMath };
