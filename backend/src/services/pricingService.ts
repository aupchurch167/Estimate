/**
 * Pricing service.
 *
 * Owns CRUD + business rules for PriceBook, PriceBookCategory,
 * PriceBookEntry, and MarkupRule. The MarkupRule evaluation engine
 * (which actually picks a rule when creating a line item) lands in 2.11
 * — for now we just persist the rules; resolveMarkup falls back to the
 * org's defaultMarkupPercent.
 */

import {
  Prisma,
  type MarkupRule,
  type MarkupRuleScope,
  type PriceBook,
  type PriceBookCategory,
  type PriceBookEntry,
  type UnitOfMeasure,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';

const ENTRIES_DEFAULT_PAGE_SIZE = 50;
const ENTRIES_MAX_PAGE_SIZE = 200;

// ─── PriceBook ─────────────────────────────────────────────────────────────

export async function listPriceBooks(organizationId: string): Promise<PriceBook[]> {
  return prisma.priceBook.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

export interface CreatePriceBookInput {
  name: string;
  description?: string | null;
  isDefault?: boolean;
}

export async function createPriceBook(
  organizationId: string,
  input: CreatePriceBookInput,
): Promise<PriceBook> {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.priceBook.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.priceBook.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description ?? null,
        isDefault: Boolean(input.isDefault),
      },
    });
  });
}

export interface UpdatePriceBookInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
}

export async function updatePriceBook(
  organizationId: string,
  id: string,
  patch: UpdatePriceBookInput,
): Promise<PriceBook> {
  await mustExist('PriceBook', { id, organizationId, deletedAt: null });
  return prisma.$transaction(async (tx) => {
    if (patch.isDefault === true) {
      await tx.priceBook.updateMany({
        where: { organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return tx.priceBook.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      },
    });
  });
}

export async function softDeletePriceBook(organizationId: string, id: string): Promise<void> {
  const book = await prisma.priceBook.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!book) throw new NotFoundError('PriceBook', id);
  if (book.isDefault) {
    throw new ConflictError(
      'Cannot delete the default price book. Promote another book to default first.',
      'cannot_delete_default_pricebook',
    );
  }
  await prisma.priceBook.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

export async function setDefaultPriceBook(
  organizationId: string,
  id: string,
): Promise<PriceBook> {
  await mustExist('PriceBook', { id, organizationId, deletedAt: null });
  return prisma.$transaction(async (tx) => {
    await tx.priceBook.updateMany({
      where: { organizationId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
    return tx.priceBook.update({ where: { id }, data: { isDefault: true } });
  });
}

// ─── Category ──────────────────────────────────────────────────────────────

export async function listCategories(
  organizationId: string,
  priceBookId: string,
): Promise<(PriceBookCategory & { entryCount: number })[]> {
  await mustExist('PriceBook', { id: priceBookId, organizationId, deletedAt: null });
  const cats = await prisma.priceBookCategory.findMany({
    where: { priceBookId, organizationId, deletedAt: null },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { entries: { where: { deletedAt: null } } } },
    },
  });
  return cats.map(({ _count, ...rest }) => ({ ...rest, entryCount: _count.entries }));
}

export interface CreateCategoryInput {
  name: string;
  description?: string | null;
  csiDivision?: string | null;
  defaultMarkupPercent?: string | null;
  order?: number;
}

export async function createCategory(
  organizationId: string,
  priceBookId: string,
  input: CreateCategoryInput,
): Promise<PriceBookCategory> {
  await mustExist('PriceBook', { id: priceBookId, organizationId, deletedAt: null });
  let order = input.order;
  if (order === undefined) {
    const max = await prisma.priceBookCategory.aggregate({
      where: { priceBookId, deletedAt: null },
      _max: { order: true },
    });
    order = (max._max.order ?? -1) + 1;
  }
  return prisma.priceBookCategory.create({
    data: {
      organizationId,
      priceBookId,
      name: input.name,
      description: input.description ?? null,
      csiDivision: input.csiDivision ?? null,
      defaultMarkupPercent: input.defaultMarkupPercent ?? null,
      order,
    },
  });
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
  csiDivision?: string | null;
  defaultMarkupPercent?: string | null;
  order?: number;
}

export async function updateCategory(
  organizationId: string,
  id: string,
  patch: UpdateCategoryInput,
): Promise<PriceBookCategory> {
  const cat = await prisma.priceBookCategory.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!cat) throw new NotFoundError('PriceBookCategory', id);
  return prisma.priceBookCategory.update({
    where: { id },
    data: patch,
  });
}

export async function deleteCategory(
  organizationId: string,
  id: string,
  force = false,
): Promise<{ deleted: true } | { deleted: false; entryCount: number }> {
  const cat = await prisma.priceBookCategory.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!cat) throw new NotFoundError('PriceBookCategory', id);
  const entryCount = await prisma.priceBookEntry.count({
    where: { categoryId: id, deletedAt: null },
  });
  if (entryCount > 0 && !force) {
    throw new ConflictError(
      `Category has ${entryCount} active entries. Use ?force=true to soft-delete them along with the category.`,
      'category_has_entries',
      { entryCount },
    );
  }
  await prisma.$transaction(async (tx) => {
    if (entryCount > 0) {
      await tx.priceBookEntry.updateMany({
        where: { categoryId: id, deletedAt: null },
        data: { deletedAt: new Date(), isActive: false },
      });
    }
    await tx.priceBookCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  });
  return { deleted: true };
}

// ─── Entry ─────────────────────────────────────────────────────────────────

export interface ListEntriesOptions {
  search?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedEntries {
  data: PriceBookEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listEntries(
  organizationId: string,
  priceBookId: string,
  opts: ListEntriesOptions = {},
): Promise<PaginatedEntries> {
  await mustExist('PriceBook', { id: priceBookId, organizationId, deletedAt: null });

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(
    ENTRIES_MAX_PAGE_SIZE,
    Math.max(1, opts.pageSize ?? ENTRIES_DEFAULT_PAGE_SIZE),
  );

  const where: Prisma.PriceBookEntryWhereInput = {
    organizationId,
    priceBookId,
    deletedAt: null,
  };
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.search && opts.search.trim().length > 0) {
    const q = opts.search.trim();
    where.OR = [
      { description: { contains: q, mode: 'insensitive' } },
      { aiKeywords: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, data] = await prisma.$transaction([
    prisma.priceBookEntry.count({ where }),
    prisma.priceBookEntry.findMany({
      where,
      orderBy: [{ description: 'asc' }],
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

export interface CreateEntryInput {
  categoryId: string;
  code?: string | null;
  description: string;
  longDescription?: string | null;
  unitOfMeasure: UnitOfMeasure;
  customUnitOfMeasure?: string | null;
  unitCostMaterial?: string;
  unitCostLabor?: string;
  defaultMarkupPercent?: string | null;
  aiKeywords?: string | null;
}

export async function createEntry(
  organizationId: string,
  priceBookId: string,
  input: CreateEntryInput,
): Promise<PriceBookEntry> {
  await mustExist('PriceBook', { id: priceBookId, organizationId, deletedAt: null });
  await mustExist('PriceBookCategory', {
    id: input.categoryId,
    organizationId,
    priceBookId,
    deletedAt: null,
  });
  try {
    return await prisma.priceBookEntry.create({
      data: {
        organizationId,
        priceBookId,
        categoryId: input.categoryId,
        code: input.code ?? null,
        description: input.description,
        longDescription: input.longDescription ?? null,
        unitOfMeasure: input.unitOfMeasure,
        customUnitOfMeasure: input.customUnitOfMeasure ?? null,
        unitCostMaterial: input.unitCostMaterial ?? '0',
        unitCostLabor: input.unitCostLabor ?? '0',
        defaultMarkupPercent: input.defaultMarkupPercent ?? null,
        aiKeywords: input.aiKeywords ?? null,
      },
    });
  } catch (err) {
    throw mapEntryUniqueError(err, input.code ?? null);
  }
}

export interface UpdateEntryInput {
  categoryId?: string;
  code?: string | null;
  description?: string;
  longDescription?: string | null;
  unitOfMeasure?: UnitOfMeasure;
  customUnitOfMeasure?: string | null;
  unitCostMaterial?: string;
  unitCostLabor?: string;
  defaultMarkupPercent?: string | null;
  aiKeywords?: string | null;
  isActive?: boolean;
}

export async function updateEntry(
  organizationId: string,
  id: string,
  patch: UpdateEntryInput,
): Promise<PriceBookEntry> {
  const entry = await prisma.priceBookEntry.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!entry) throw new NotFoundError('PriceBookEntry', id);
  if (patch.categoryId && patch.categoryId !== entry.categoryId) {
    await mustExist('PriceBookCategory', {
      id: patch.categoryId,
      organizationId,
      priceBookId: entry.priceBookId,
      deletedAt: null,
    });
  }
  try {
    return await prisma.priceBookEntry.update({
      where: { id },
      data: patch,
    });
  } catch (err) {
    throw mapEntryUniqueError(err, patch.code ?? entry.code);
  }
}

export async function softDeleteEntry(organizationId: string, id: string): Promise<void> {
  const entry = await prisma.priceBookEntry.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!entry) throw new NotFoundError('PriceBookEntry', id);
  await prisma.priceBookEntry.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

export async function incrementUsage(entryId: string): Promise<void> {
  await prisma.priceBookEntry.update({
    where: { id: entryId },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

// ─── MarkupRule (UI lands in P1; CRUD is wired now per playbook) ───────────

export async function listMarkupRules(organizationId: string): Promise<MarkupRule[]> {
  return prisma.markupRule.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export interface CreateMarkupRuleInput {
  name: string;
  appliesTo: MarkupRuleScope;
  matchValue: string;
  markupPercent: string;
  priority: number;
  priceBookId?: string | null;
  isActive?: boolean;
}

export async function createMarkupRule(
  organizationId: string,
  input: CreateMarkupRuleInput,
): Promise<MarkupRule> {
  if (input.priceBookId) {
    await mustExist('PriceBook', {
      id: input.priceBookId,
      organizationId,
      deletedAt: null,
    });
  }
  return prisma.markupRule.create({
    data: {
      organizationId,
      name: input.name,
      appliesTo: input.appliesTo,
      matchValue: input.matchValue,
      markupPercent: input.markupPercent,
      priority: input.priority,
      priceBookId: input.priceBookId ?? null,
      isActive: input.isActive ?? true,
    },
  });
}

export interface UpdateMarkupRuleInput {
  name?: string;
  appliesTo?: MarkupRuleScope;
  matchValue?: string;
  markupPercent?: string;
  priority?: number;
  isActive?: boolean;
}

export async function updateMarkupRule(
  organizationId: string,
  id: string,
  patch: UpdateMarkupRuleInput,
): Promise<MarkupRule> {
  const rule = await prisma.markupRule.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!rule) throw new NotFoundError('MarkupRule', id);
  return prisma.markupRule.update({ where: { id }, data: patch });
}

export async function softDeleteMarkupRule(
  organizationId: string,
  id: string,
): Promise<void> {
  const rule = await prisma.markupRule.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!rule) throw new NotFoundError('MarkupRule', id);
  await prisma.markupRule.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function mustExist(
  resource: string,
  where: Record<string, unknown>,
): Promise<void> {
  const map: Record<
    string,
    (w: Record<string, unknown>) => Promise<unknown | null>
  > = {
    PriceBook: (w) => prisma.priceBook.findFirst({ where: w as Prisma.PriceBookWhereInput }),
    PriceBookCategory: (w) =>
      prisma.priceBookCategory.findFirst({ where: w as Prisma.PriceBookCategoryWhereInput }),
  };
  const finder = map[resource];
  if (!finder) throw new Error(`mustExist: unknown resource "${resource}"`);
  const exists = await finder(where);
  if (!exists) {
    throw new NotFoundError(resource, JSON.stringify(where));
  }
}

function mapEntryUniqueError(err: unknown, code: string | null): Error {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray(err.meta?.target) &&
    err.meta.target.includes('code')
  ) {
    return new ConflictError(
      `An entry with code "${code}" already exists in this org`,
      'code_conflict',
      { code },
    );
  }
  return err as Error;
}
