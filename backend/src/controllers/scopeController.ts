/**
 * Scope section + line item HTTP controllers.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import * as sectionService from '../services/scopeSectionService.js';
import * as lineItemService from '../services/lineItemService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

const UNITS = [
  'SF',
  'LF',
  'CF',
  'EA',
  'HR',
  'DY',
  'LS',
  'CY',
  'SY',
  'GAL',
  'TON',
  'CUSTOM',
] as const;
const STATUSES = ['DRAFT', 'CONFIRMED', 'NEEDS_REVIEW', 'ASSUMED', 'NO_PRICE', 'PENDING_SUB_QUOTE'] as const;
const SOURCES = ['AI_GENERATED', 'PRICEBOOK', 'MANUAL', 'TEMPLATE'] as const;

const decimalString = (max = 1) =>
  z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal')
    .refine((v) => Number(v) <= max, `Must be ≤ ${max}`);

const sectionCreateBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  markupPercent: decimalString(1).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

const sectionPatchBody = sectionCreateBody.partial();

const sectionReorderBody = z.object({
  sections: z
    .array(z.object({ id: z.string().min(1), order: z.number().int().min(0) }))
    .min(1)
    .max(500),
});

// scopeSectionId is intentionally NOT in the create body — the section id
// comes from the URL path. The patch body adds it as an optional field
// so a line item can be moved between sections.
const lineItemCreateBody = z.object({
  description: z.string().min(1).max(2000),
  quantity: z.string().regex(/^\d+(\.\d+)?$/, 'Quantity must be ≥ 0').optional(),
  unitOfMeasure: z.enum(UNITS),
  customUnitOfMeasure: z.string().max(40).nullable().optional(),
  unitCostMaterial: z.string().regex(/^\d+(\.\d+)?$/, 'Must be ≥ 0').optional(),
  unitCostLabor: z.string().regex(/^\d+(\.\d+)?$/, 'Must be ≥ 0').optional(),
  markupPercent: decimalString(1).nullable().optional(),
  priceBookEntryId: z.string().min(1).nullable().optional(),
  source: z.enum(SOURCES).optional(),
  status: z.enum(STATUSES).optional(),
  aiConfidence: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  aiAssumption: z.string().max(2000).nullable().optional(),
  internalNotes: z.string().max(4000).nullable().optional(),
  clientNotes: z.string().max(4000).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

const lineItemPatchBody = lineItemCreateBody
  .extend({
    scopeSectionId: z.string().min(1).optional(),
  })
  .partial();

const bulkBody = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('delete'),
    lineItemIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    operation: z.literal('update'),
    lineItemIds: z.array(z.string().min(1)).min(1),
    payload: z.object({
      status: z.enum(STATUSES).optional(),
      unitCostMaterial: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      unitCostLabor: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      markupPercent: decimalString(1).optional(),
      unitOfMeasure: z.enum(UNITS).optional(),
    }),
  }),
  z.object({
    operation: z.literal('applyMarkup'),
    lineItemIds: z.array(z.string().min(1)).min(1),
    payload: z.object({ markupPercent: decimalString(1) }),
  }),
]);

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Invalid request', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
  }
  return result.data;
}

function actorFrom(req: Request) {
  if (!req.user || !req.organization) throw new ForbiddenError('Not authenticated');
  return {
    orgId: req.organization.id,
    actor: { id: req.user.id, role: req.user.role },
  };
}

// ─── Section handlers ────────────────────────────────────────────────────

export async function createSection(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(sectionCreateBody, req.body);
  const section = await sectionService.create(
    orgId,
    actor,
    String(req.params.id ?? ''),
    input,
  );
  res.status(201).json({ section });
}

export async function patchSection(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(sectionPatchBody, req.body);
  const section = await sectionService.update(
    orgId,
    actor,
    String(req.params.id ?? ''),
    input,
  );
  ok(res, { section });
}

export async function deleteSection(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  await sectionService.softDelete(orgId, actor, String(req.params.id ?? ''));
  res.status(204).end();
}

export async function reorderSections(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(sectionReorderBody, req.body);
  await sectionService.reorder(orgId, actor, String(req.params.id ?? ''), input.sections);
  res.status(204).end();
}

// ─── LineItem handlers ───────────────────────────────────────────────────

export async function createLineItem(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(lineItemCreateBody, req.body);
  // The route mounts this under /api/scope-sections/:id/line-items so the
  // section id comes from req.params; the body validates everything else.
  const lineItem = await lineItemService.create(
    orgId,
    actor,
    // estimateId is derived from the section in the service
    await derivedEstimateId(orgId, String(req.params.id ?? '')),
    { ...input, scopeSectionId: String(req.params.id ?? '') },
  );
  res.status(201).json({ lineItem });
}

export async function patchLineItem(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(lineItemPatchBody, req.body);
  const lineItem = await lineItemService.update(
    orgId,
    actor,
    String(req.params.id ?? ''),
    input,
  );
  ok(res, { lineItem });
}

export async function deleteLineItem(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  await lineItemService.softDelete(orgId, actor, String(req.params.id ?? ''));
  res.status(204).end();
}

export async function bulkLineItems(req: Request, res: Response): Promise<void> {
  const { orgId, actor } = actorFrom(req);
  const input = parse(bulkBody, req.body);
  const result = await lineItemService.bulk(orgId, actor, input);
  ok(res, result);
}

async function derivedEstimateId(orgId: string, sectionId: string): Promise<string> {
  const { prisma } = await import('../lib/prisma.js');
  const section = await prisma.scopeSection.findFirst({
    where: { id: sectionId, organizationId: orgId, deletedAt: null },
    select: { estimateId: true },
  });
  if (!section) throw new ValidationError('Scope section not found', { id: sectionId });
  return section.estimateId;
}
