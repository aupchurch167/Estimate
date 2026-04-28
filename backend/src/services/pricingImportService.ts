/**
 * Price-book CSV import.
 *
 * Two-phase: parseCsv → build preview → commit. Validation runs during
 * parse; the commit step is atomic (single $transaction), so either all
 * valid rows are applied or none are.
 *
 * Expected columns (case-insensitive, snake_case after normalization):
 *   category, code?, description, long_description?, unit_of_measure,
 *   unit_cost_material, unit_cost_labor, default_markup_percent?,
 *   ai_keywords?
 *
 * Matching strategy on commit:
 *   1. If `code` is present AND an active entry with the same
 *      (organizationId, code) exists → update it.
 *   2. Else match on (priceBookId, categoryId, description) exact → update.
 *   3. Else create.
 */

import Papa from 'papaparse';
import type { Prisma, UnitOfMeasure } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const REQUIRED_COLUMNS = ['category', 'description', 'unit_of_measure'];

const UOM_ALIASES: Record<string, UnitOfMeasure> = {
  // canonical
  sf: 'SF',
  lf: 'LF',
  cf: 'CF',
  ea: 'EA',
  hr: 'HR',
  dy: 'DY',
  ls: 'LS',
  cy: 'CY',
  sy: 'SY',
  gal: 'GAL',
  ton: 'TON',
  custom: 'CUSTOM',
  // friendly variants
  'sq ft': 'SF',
  sqft: 'SF',
  'square feet': 'SF',
  'square foot': 'SF',
  'linear feet': 'LF',
  'linear foot': 'LF',
  'lin ft': 'LF',
  'cu ft': 'CF',
  'cubic feet': 'CF',
  'cubic foot': 'CF',
  each: 'EA',
  hour: 'HR',
  hours: 'HR',
  day: 'DY',
  days: 'DY',
  'lump sum': 'LS',
  lumpsum: 'LS',
  'cu yd': 'CY',
  'cubic yard': 'CY',
  'cubic yards': 'CY',
  'sq yd': 'SY',
  'square yard': 'SY',
  'square yards': 'SY',
  gallon: 'GAL',
  gallons: 'GAL',
  tons: 'TON',
};

export function normalizeUnitOfMeasure(value: string): UnitOfMeasure | null {
  const key = value.trim().toLowerCase();
  return UOM_ALIASES[key] ?? null;
}

function parsePercent(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const hasPct = trimmed.endsWith('%');
  const cleaned = hasPct ? trimmed.slice(0, -1).trim() : trimmed;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return Number.NaN;
  return hasPct ? n / 100 : n;
}

export interface ParsedRow {
  rowNumber: number; // 1-based, includes header row
  category: string;
  code: string | null;
  description: string;
  longDescription: string | null;
  unitOfMeasure: UnitOfMeasure;
  customUnitOfMeasure: string | null;
  unitCostMaterial: string;
  unitCostLabor: string;
  defaultMarkupPercent: string | null;
  aiKeywords: string | null;
}

export interface RowError {
  row: number;
  column?: string;
  message: string;
}

export interface ParseCsvResult {
  rows: ParsedRow[];
  errors: RowError[];
  totalRows: number;
}

interface RawRow {
  [key: string]: string | undefined;
}

export function parseCsv(buffer: Buffer): ParseCsvResult {
  const text = buffer.toString('utf-8');
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) =>
      h
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, ''),
  });

  const errors: RowError[] = [];
  for (const e of result.errors) {
    errors.push({ row: e.row !== undefined ? e.row + 2 : 0, message: e.message });
  }

  const headers = result.meta.fields ?? [];
  for (const required of REQUIRED_COLUMNS) {
    if (!headers.includes(required)) {
      errors.push({
        row: 1,
        column: required,
        message: `Missing required column: ${required}`,
      });
    }
  }

  const rows: ParsedRow[] = [];
  if (errors.some((e) => e.row === 1)) {
    return { rows, errors, totalRows: result.data.length };
  }

  result.data.forEach((raw, idx) => {
    const rowNumber = idx + 2; // 1 header + 1-based
    const errBefore = errors.length;

    const description = (raw.description ?? '').trim();
    if (description.length === 0) {
      errors.push({ row: rowNumber, column: 'description', message: 'description is required' });
    } else if (description.length > 500) {
      errors.push({
        row: rowNumber,
        column: 'description',
        message: 'description too long (max 500 chars)',
      });
    }

    const category = (raw.category ?? '').trim();
    if (category.length === 0) {
      errors.push({ row: rowNumber, column: 'category', message: 'category is required' });
    }

    const uomRaw = raw.unit_of_measure ?? '';
    const uom = normalizeUnitOfMeasure(uomRaw);
    if (!uom) {
      errors.push({
        row: rowNumber,
        column: 'unit_of_measure',
        message: `Unknown unit of measure: "${uomRaw}"`,
      });
    }

    const material = parseDecimal(raw.unit_cost_material);
    const labor = parseDecimal(raw.unit_cost_labor);
    if (material === null) {
      errors.push({
        row: rowNumber,
        column: 'unit_cost_material',
        message: 'unit_cost_material must be a non-negative number',
      });
    }
    if (labor === null) {
      errors.push({
        row: rowNumber,
        column: 'unit_cost_labor',
        message: 'unit_cost_labor must be a non-negative number',
      });
    }

    let markupString: string | null = null;
    const markup = parsePercent(raw.default_markup_percent);
    if (markup !== null) {
      if (Number.isNaN(markup) || markup < 0 || markup > 1) {
        errors.push({
          row: rowNumber,
          column: 'default_markup_percent',
          message: 'default_markup_percent must be between 0 and 1 (or 0%–100%)',
        });
      } else {
        markupString = String(markup);
      }
    }

    if (errors.length === errBefore && uom) {
      rows.push({
        rowNumber,
        category,
        code: (raw.code ?? '').trim() || null,
        description,
        longDescription: (raw.long_description ?? '').trim() || null,
        unitOfMeasure: uom,
        customUnitOfMeasure:
          uom === 'CUSTOM' ? (raw.custom_unit_of_measure ?? '').trim() || null : null,
        unitCostMaterial: String(material),
        unitCostLabor: String(labor),
        defaultMarkupPercent: markupString,
        aiKeywords: (raw.ai_keywords ?? '').trim() || null,
      });
    }
  });

  return { rows, errors, totalRows: result.data.length };
}

function parseDecimal(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return 0;
  const cleaned = trimmed.replace(/^\$/, '').replace(/,/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// ─── Preview + commit ──────────────────────────────────────────────────────

export interface ImportPreview {
  categoriesToCreate: string[];
  entriesToCreate: number;
  entriesToUpdate: number;
  entriesSkipped: number;
}

export interface ImportResult extends ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: RowError[];
  committed: boolean;
}

export async function buildPreview(
  organizationId: string,
  priceBookId: string,
  rows: ParsedRow[],
): Promise<ImportPreview> {
  if (rows.length === 0) {
    return { categoriesToCreate: [], entriesToCreate: 0, entriesToUpdate: 0, entriesSkipped: 0 };
  }
  const existingCategories = await prisma.priceBookCategory.findMany({
    where: { priceBookId, deletedAt: null },
  });
  const existingCategoryNames = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  const categoriesToCreate = new Set<string>();
  for (const r of rows) {
    if (!existingCategoryNames.has(r.category.toLowerCase())) {
      categoriesToCreate.add(r.category);
    }
  }

  const codes = rows.map((r) => r.code).filter((c): c is string => Boolean(c));
  const existingByCode = new Map<string, string>(); // code → entryId
  if (codes.length > 0) {
    const found = await prisma.priceBookEntry.findMany({
      where: {
        organizationId,
        code: { in: codes },
        deletedAt: null,
      },
      select: { id: true, code: true },
    });
    for (const e of found) if (e.code) existingByCode.set(e.code, e.id);
  }

  const existingByCatDesc = new Map<string, string>(); // `${categoryId}|${description}` → entryId
  const allEntries = await prisma.priceBookEntry.findMany({
    where: { priceBookId, deletedAt: null },
    select: { id: true, categoryId: true, description: true },
  });
  for (const e of allEntries) {
    existingByCatDesc.set(`${e.categoryId}|${e.description.toLowerCase()}`, e.id);
  }

  const catIdByName = new Map<string, string>();
  for (const c of existingCategories) catIdByName.set(c.name.toLowerCase(), c.id);

  let entriesToCreate = 0;
  let entriesToUpdate = 0;
  for (const r of rows) {
    if (r.code && existingByCode.has(r.code)) {
      entriesToUpdate += 1;
      continue;
    }
    const catId = catIdByName.get(r.category.toLowerCase());
    if (catId && existingByCatDesc.has(`${catId}|${r.description.toLowerCase()}`)) {
      entriesToUpdate += 1;
      continue;
    }
    entriesToCreate += 1;
  }

  return {
    categoriesToCreate: Array.from(categoriesToCreate),
    entriesToCreate,
    entriesToUpdate,
    entriesSkipped: 0,
  };
}

export interface CommitOptions {
  actorId: string;
}

export async function commit(
  organizationId: string,
  priceBookId: string,
  rows: ParsedRow[],
  options: CommitOptions,
): Promise<ImportPreview> {
  const book = await prisma.priceBook.findFirst({
    where: { id: priceBookId, organizationId, deletedAt: null },
  });
  if (!book) throw new NotFoundError('PriceBook', priceBookId);

  const result = await prisma.$transaction(
    async (tx) => {
      // Resolve categories: load existing, create missing.
      const existing = await tx.priceBookCategory.findMany({
        where: { priceBookId, deletedAt: null },
        orderBy: { order: 'asc' },
      });
      const idByName = new Map<string, string>();
      for (const c of existing) idByName.set(c.name.toLowerCase(), c.id);
      let nextOrder = existing.reduce((m, c) => (c.order > m ? c.order : m), -1) + 1;

      const categoriesToCreate = new Set<string>();
      for (const r of rows) {
        if (!idByName.has(r.category.toLowerCase())) categoriesToCreate.add(r.category);
      }
      for (const name of categoriesToCreate) {
        const created = await tx.priceBookCategory.create({
          data: {
            organizationId,
            priceBookId,
            name,
            order: nextOrder++,
          },
        });
        idByName.set(name.toLowerCase(), created.id);
      }

      // Existing entries lookup tables.
      const allEntries = await tx.priceBookEntry.findMany({
        where: { priceBookId, deletedAt: null },
        select: { id: true, categoryId: true, description: true, code: true },
      });
      const idByCode = new Map<string, string>();
      const idByCatDesc = new Map<string, string>();
      for (const e of allEntries) {
        if (e.code) idByCode.set(e.code, e.id);
        idByCatDesc.set(`${e.categoryId}|${e.description.toLowerCase()}`, e.id);
      }

      let entriesToCreate = 0;
      let entriesToUpdate = 0;
      for (const r of rows) {
        const categoryId = idByName.get(r.category.toLowerCase());
        if (!categoryId) {
          throw new Error(`Category resolution failed: ${r.category}`);
        }

        const data: Prisma.PriceBookEntryUncheckedCreateInput = {
          organizationId,
          priceBookId,
          categoryId,
          code: r.code,
          description: r.description,
          longDescription: r.longDescription,
          unitOfMeasure: r.unitOfMeasure,
          customUnitOfMeasure: r.customUnitOfMeasure,
          unitCostMaterial: r.unitCostMaterial,
          unitCostLabor: r.unitCostLabor,
          defaultMarkupPercent: r.defaultMarkupPercent,
          aiKeywords: r.aiKeywords,
        };

        const matchByCode = r.code ? idByCode.get(r.code) : undefined;
        const matchByCatDesc = idByCatDesc.get(`${categoryId}|${r.description.toLowerCase()}`);
        const targetId = matchByCode ?? matchByCatDesc;
        if (targetId) {
          await tx.priceBookEntry.update({
            where: { id: targetId },
            data: {
              categoryId,
              code: r.code,
              description: r.description,
              longDescription: r.longDescription,
              unitOfMeasure: r.unitOfMeasure,
              customUnitOfMeasure: r.customUnitOfMeasure,
              unitCostMaterial: r.unitCostMaterial,
              unitCostLabor: r.unitCostLabor,
              defaultMarkupPercent: r.defaultMarkupPercent,
              aiKeywords: r.aiKeywords,
            },
          });
          entriesToUpdate += 1;
        } else {
          const created = await tx.priceBookEntry.create({ data });
          if (created.code) idByCode.set(created.code, created.id);
          idByCatDesc.set(`${categoryId}|${created.description.toLowerCase()}`, created.id);
          entriesToCreate += 1;
        }
      }

      await tx.activityEvent.create({
        data: {
          organizationId,
          actorId: options.actorId,
          eventType: 'PRICEBOOK_BULK_IMPORTED',
          entityType: 'PriceBook',
          entityId: priceBookId,
          summary: `Imported ${rows.length} price book rows`,
          meta: {
            priceBookId,
            entriesCreated: entriesToCreate,
            entriesUpdated: entriesToUpdate,
            categoriesCreated: Array.from(categoriesToCreate),
          },
        },
      });

      return {
        categoriesToCreate: Array.from(categoriesToCreate),
        entriesToCreate,
        entriesToUpdate,
        entriesSkipped: 0,
      } satisfies ImportPreview;
    },
    { timeout: 30_000 },
  );

  return result;
}

// ─── Orchestration ─────────────────────────────────────────────────────────

export interface RunImportOptions {
  organizationId: string;
  priceBookId: string;
  buffer: Buffer;
  dryRun: boolean;
  actorId: string;
}

export async function runImport(opts: RunImportOptions): Promise<ImportResult> {
  const parsed = parseCsv(opts.buffer);

  // If we couldn't even validate the headers, bail with 422-style payload.
  const headerErrors = parsed.errors.filter((e) => e.row === 1);
  if (headerErrors.length > 0) {
    throw new ValidationError('CSV missing required columns', {
      issues: headerErrors,
    });
  }

  const validRows = parsed.rows;
  const errorRows = parsed.totalRows - validRows.length;
  const preview = await buildPreview(opts.organizationId, opts.priceBookId, validRows);

  if (opts.dryRun || parsed.errors.length > 0) {
    return {
      ...preview,
      totalRows: parsed.totalRows,
      validRows: validRows.length,
      errorRows,
      errors: parsed.errors,
      committed: false,
    };
  }

  // No errors → commit atomically.
  try {
    const written = await commit(opts.organizationId, opts.priceBookId, validRows, {
      actorId: opts.actorId,
    });
    return {
      ...written,
      totalRows: parsed.totalRows,
      validRows: validRows.length,
      errorRows,
      errors: [],
      committed: true,
    };
  } catch (err) {
    logger.error({ err, priceBookId: opts.priceBookId }, 'pricing import commit failed');
    if (err instanceof Error && err.message?.includes('Category resolution failed')) {
      throw new ConflictError('Category resolution failed during import', 'category_resolution');
    }
    throw err;
  }
}
