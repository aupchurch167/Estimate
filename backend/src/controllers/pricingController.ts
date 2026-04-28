/**
 * Pricing HTTP controllers.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import * as pricingService from '../services/pricingService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';
import { ok } from '../lib/response.js';

// ─── Schemas ───────────────────────────────────────────────────────────────

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

const decimalString = (max = 1, min = 0) =>
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'Must be a number')
    .refine(
      (v) => {
        const n = Number(v);
        return n >= min && n <= max;
      },
      `Must be between ${min} and ${max}`,
    );

const nonNegativeDecimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be ≥ 0');

const priceBookCreateBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  isDefault: z.boolean().optional(),
});

const priceBookPatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const categoryCreateBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  csiDivision: z.string().max(40).nullable().optional(),
  defaultMarkupPercent: decimalString(1, 0).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

const categoryPatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  csiDivision: z.string().max(40).nullable().optional(),
  defaultMarkupPercent: decimalString(1, 0).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

const entryCreateBody = z.object({
  categoryId: z.string().min(1),
  code: z.string().max(40).nullable().optional(),
  description: z.string().min(1).max(500),
  longDescription: z.string().max(4000).nullable().optional(),
  unitOfMeasure: z.enum(UNITS),
  customUnitOfMeasure: z.string().max(40).nullable().optional(),
  unitCostMaterial: nonNegativeDecimalString.optional(),
  unitCostLabor: nonNegativeDecimalString.optional(),
  defaultMarkupPercent: decimalString(1, 0).nullable().optional(),
  aiKeywords: z.string().max(2000).nullable().optional(),
});

const entryPatchBody = z.object({
  categoryId: z.string().min(1).optional(),
  code: z.string().max(40).nullable().optional(),
  description: z.string().min(1).max(500).optional(),
  longDescription: z.string().max(4000).nullable().optional(),
  unitOfMeasure: z.enum(UNITS).optional(),
  customUnitOfMeasure: z.string().max(40).nullable().optional(),
  unitCostMaterial: nonNegativeDecimalString.optional(),
  unitCostLabor: nonNegativeDecimalString.optional(),
  defaultMarkupPercent: decimalString(1, 0).nullable().optional(),
  aiKeywords: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const markupRuleCreateBody = z.object({
  name: z.string().min(1).max(120),
  appliesTo: z.enum(['CATEGORY', 'SECTION_NAME_MATCH', 'LINE_DESCRIPTION_MATCH']),
  matchValue: z.string().min(1).max(500),
  markupPercent: decimalString(1, 0),
  priority: z.number().int().min(0).max(1_000_000),
  priceBookId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

const markupRulePatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  appliesTo: z.enum(['CATEGORY', 'SECTION_NAME_MATCH', 'LINE_DESCRIPTION_MATCH']).optional(),
  matchValue: z.string().min(1).max(500).optional(),
  markupPercent: decimalString(1, 0).optional(),
  priority: z.number().int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
});

const entriesQueryParams = z.object({
  search: z.string().max(200).optional(),
  category: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError('Invalid request body', {
      issues: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
  }
  return result.data;
}

function assertOrg(req: Request): string {
  if (!req.organization) throw new ForbiddenError('Not authenticated');
  return req.organization.id;
}

// ─── PriceBook ─────────────────────────────────────────────────────────────

export async function listPriceBooks(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const priceBooks = await pricingService.listPriceBooks(orgId);
  ok(res, { priceBooks });
}

export async function createPriceBook(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(priceBookCreateBody, req.body);
  const priceBook = await pricingService.createPriceBook(orgId, input);
  res.status(201).json({ priceBook });
}

export async function patchPriceBook(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(priceBookPatchBody, req.body);
  const priceBook = await pricingService.updatePriceBook(
    orgId,
    String(req.params.id ?? ''),
    input,
  );
  ok(res, { priceBook });
}

export async function deletePriceBook(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  await pricingService.softDeletePriceBook(orgId, String(req.params.id ?? ''));
  res.status(204).end();
}

// ─── Category ──────────────────────────────────────────────────────────────

export async function listCategories(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const categories = await pricingService.listCategories(orgId, String(req.params.id ?? ''));
  ok(res, { categories });
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(categoryCreateBody, req.body);
  const category = await pricingService.createCategory(
    orgId,
    String(req.params.id ?? ''),
    input,
  );
  res.status(201).json({ category });
}

export async function patchCategory(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(categoryPatchBody, req.body);
  const category = await pricingService.updateCategory(
    orgId,
    String(req.params.id ?? ''),
    input,
  );
  ok(res, { category });
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const force = req.query.force === 'true';
  await pricingService.deleteCategory(orgId, String(req.params.id ?? ''), force);
  res.status(204).end();
}

// ─── Entry ─────────────────────────────────────────────────────────────────

export async function listEntries(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const q = parse(entriesQueryParams, req.query);
  const result = await pricingService.listEntries(orgId, String(req.params.id ?? ''), {
    search: q.search,
    categoryId: q.category,
    page: q.page,
    pageSize: q.limit,
  });
  res.status(200).json(result);
}

export async function createEntry(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(entryCreateBody, req.body);
  const entry = await pricingService.createEntry(
    orgId,
    String(req.params.id ?? ''),
    input,
  );
  res.status(201).json({ entry });
}

export async function patchEntry(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(entryPatchBody, req.body);
  const entry = await pricingService.updateEntry(
    orgId,
    String(req.params.id ?? ''),
    input,
  );
  ok(res, { entry });
}

export async function deleteEntry(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  await pricingService.softDeleteEntry(orgId, String(req.params.id ?? ''));
  res.status(204).end();
}

// ─── MarkupRule ────────────────────────────────────────────────────────────

export async function listMarkupRules(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const rules = await pricingService.listMarkupRules(orgId);
  ok(res, { markupRules: rules });
}

export async function createMarkupRule(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(markupRuleCreateBody, req.body);
  const markupRule = await pricingService.createMarkupRule(orgId, input);
  res.status(201).json({ markupRule });
}

export async function patchMarkupRule(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  const input = parse(markupRulePatchBody, req.body);
  const markupRule = await pricingService.updateMarkupRule(
    orgId,
    String(req.params.id ?? ''),
    input,
  );
  ok(res, { markupRule });
}

export async function deleteMarkupRule(req: Request, res: Response): Promise<void> {
  const orgId = assertOrg(req);
  await pricingService.softDeleteMarkupRule(orgId, String(req.params.id ?? ''));
  res.status(204).end();
}
