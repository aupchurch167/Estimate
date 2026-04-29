/**
 * Unit + integration tests for the CSV import flow.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import {
  normalizeUnitOfMeasure,
  parseCsv,
  runImport,
} from '../../services/pricingImportService.js';
import { signup as serviceSignup } from '../../services/authService.js';
import * as pricingService from '../../services/pricingService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function makeOrgWithBook() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `Import Tests ${counter} ${RUN_ID}`,
    email: `import-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'I',
    lastName: 'M',
  });
  orgIds.add(result.organization.id);
  const book = await pricingService.createPriceBook(result.organization.id, {
    name: 'Test Book',
    isDefault: true,
  });
  return {
    organizationId: result.organization.id,
    actorId: result.user.id,
    priceBookId: book.id,
  };
}

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.activityEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBookEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBookCategory.deleteMany({ where: { organizationId: orgId } });
    await prisma.priceBook.deleteMany({ where: { organizationId: orgId } });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('normalizeUnitOfMeasure', () => {
  it.each([
    ['SF', 'SF'],
    ['sf', 'SF'],
    ['sq ft', 'SF'],
    ['SqFt', 'SF'],
    ['square feet', 'SF'],
    ['LF', 'LF'],
    ['linear feet', 'LF'],
    ['Each', 'EA'],
    ['gallons', 'GAL'],
    ['lump sum', 'LS'],
    ['Cubic Yards', 'CY'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUnitOfMeasure(input)).toBe(expected);
  });

  it('returns null on unknown values', () => {
    expect(normalizeUnitOfMeasure('parsec')).toBeNull();
    expect(normalizeUnitOfMeasure('')).toBeNull();
  });
});

describe('parseCsv', () => {
  it('parses a clean file with mixed UoM aliases and percent formats', () => {
    const csv = [
      'Category,Code,Description,Unit_of_Measure,Unit_Cost_Material,Unit_Cost_Labor,default_markup_percent,ai_keywords',
      'Demolition,D-100,"Demo, single-side gypsum",sq ft,0.50,2.00,20%,demo gypsum',
      'Framing,,Metal stud partition,LF,4.50,8.00,0.20,metal stud',
    ].join('\n');
    const r = parseCsv(Buffer.from(csv));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]?.unitOfMeasure).toBe('SF');
    expect(r.rows[0]?.code).toBe('D-100');
    expect(r.rows[0]?.defaultMarkupPercent).toBe('0.2');
    expect(r.rows[1]?.code).toBeNull();
    expect(r.rows[1]?.unitOfMeasure).toBe('LF');
  });

  it('reports per-row errors without dropping subsequent rows', () => {
    const csv = [
      'category,description,unit_of_measure,unit_cost_material,unit_cost_labor,default_markup_percent',
      ',Missing category,SF,1,1,0.20',
      'Drywall,,SF,1,1,0.20',
      'Drywall,Bad UoM,parsec,1,1,0.20',
      'Drywall,Negative cost,SF,-3,1,0.20',
      'Drywall,Bad markup,SF,1,1,200%',
      'Drywall,Valid row,SF,1,1,0.20',
    ].join('\n');
    const r = parseCsv(Buffer.from(csv));
    expect(r.totalRows).toBe(6);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
    expect(r.errors.some((e) => e.column === 'category')).toBe(true);
    expect(r.errors.some((e) => e.column === 'description')).toBe(true);
    expect(r.errors.some((e) => e.column === 'unit_of_measure')).toBe(true);
    expect(r.errors.some((e) => e.column === 'unit_cost_material')).toBe(true);
  });

  it('rejects missing required headers at row 1', () => {
    const csv = ['category,description', 'Drywall,5/8 gypsum'].join('\n');
    const r = parseCsv(Buffer.from(csv));
    expect(r.errors.some((e) => e.row === 1 && e.column === 'unit_of_measure')).toBe(true);
  });

  it('treats empty default_markup_percent as null (allowed)', () => {
    const csv = [
      'category,description,unit_of_measure,unit_cost_material,unit_cost_labor,default_markup_percent',
      'Demo,Some line,SF,1,2,',
    ].join('\n');
    const r = parseCsv(Buffer.from(csv));
    expect(r.errors).toEqual([]);
    expect(r.rows[0]?.defaultMarkupPercent).toBeNull();
  });

  it('rejects markup outside 0–1', () => {
    const csv = [
      'category,description,unit_of_measure,unit_cost_material,unit_cost_labor,default_markup_percent',
      'Demo,Some line,SF,1,2,150%',
    ].join('\n');
    const r = parseCsv(Buffer.from(csv));
    expect(r.rows).toHaveLength(0);
    expect(r.errors.some((e) => e.column === 'default_markup_percent')).toBe(true);
  });
});

describe('runImport', () => {
  it('dryRun never writes; preview counts categoriesToCreate + entriesToCreate', async () => {
    const ctx = await makeOrgWithBook();
    const csv = [
      'category,description,unit_of_measure,unit_cost_material,unit_cost_labor',
      'Drywall,Type X 5/8,SF,1,2',
      'Drywall,Sound batt insulation,SF,0.85,0.45',
      'Demolition,Demo gypsum,SF,0.5,2',
    ].join('\n');
    const r = await runImport({
      ...ctx,
      buffer: Buffer.from(csv),
      dryRun: true,
    });
    expect(r.committed).toBe(false);
    expect(r.totalRows).toBe(3);
    expect(r.validRows).toBe(3);
    expect(r.entriesToCreate).toBe(3);
    expect(r.categoriesToCreate.sort()).toEqual(['Demolition', 'Drywall']);

    const entries = await prisma.priceBookEntry.count({
      where: { priceBookId: ctx.priceBookId },
    });
    expect(entries).toBe(0);
  });

  it('commits valid rows atomically and writes ActivityEvent', async () => {
    const ctx = await makeOrgWithBook();
    const csv = [
      'category,code,description,unit_of_measure,unit_cost_material,unit_cost_labor,default_markup_percent,ai_keywords',
      'Drywall,D-100,5/8 Type X gypsum,SF,1.20,2.10,0.20,drywall sheetrock',
      'Drywall,D-200,Sound batt insulation,SF,0.85,0.45,0.20,acoustic batt',
      'Demolition,DM-100,Demo gypsum,sq ft,0.50,2.00,20%,demo',
    ].join('\n');
    const r = await runImport({ ...ctx, buffer: Buffer.from(csv), dryRun: false });
    expect(r.committed).toBe(true);
    expect(r.entriesToCreate).toBe(3);
    expect(r.entriesToUpdate).toBe(0);
    expect(r.categoriesToCreate.sort()).toEqual(['Demolition', 'Drywall']);

    const entries = await prisma.priceBookEntry.findMany({
      where: { priceBookId: ctx.priceBookId },
    });
    expect(entries).toHaveLength(3);
    expect(entries.find((e) => e.code === 'D-100')?.unitOfMeasure).toBe('SF');

    const activity = await prisma.activityEvent.findFirst({
      where: { organizationId: ctx.organizationId, eventType: 'PRICEBOOK_BULK_IMPORTED' },
    });
    expect(activity).toBeTruthy();
  });

  it('upserts existing entries by code on a second import', async () => {
    const ctx = await makeOrgWithBook();
    const csv1 = [
      'category,code,description,unit_of_measure,unit_cost_material,unit_cost_labor',
      'Drywall,D-100,5/8 gypsum,SF,1.0,2.0',
    ].join('\n');
    await runImport({ ...ctx, buffer: Buffer.from(csv1), dryRun: false });

    const csv2 = [
      'category,code,description,unit_of_measure,unit_cost_material,unit_cost_labor',
      'Drywall,D-100,5/8 gypsum (revised desc),SF,1.50,2.50',
    ].join('\n');
    const r = await runImport({ ...ctx, buffer: Buffer.from(csv2), dryRun: false });
    expect(r.committed).toBe(true);
    expect(r.entriesToCreate).toBe(0);
    expect(r.entriesToUpdate).toBe(1);

    const entries = await prisma.priceBookEntry.findMany({
      where: { priceBookId: ctx.priceBookId },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toContain('revised');
    expect(String(entries[0]?.unitCostMaterial)).toBe('1.5');
  });

  it('upserts existing entries by (categoryId, description) when there is no code', async () => {
    const ctx = await makeOrgWithBook();
    const csv1 = [
      'category,description,unit_of_measure,unit_cost_material,unit_cost_labor',
      'Drywall,Sound batt insulation,SF,0.85,0.45',
    ].join('\n');
    await runImport({ ...ctx, buffer: Buffer.from(csv1), dryRun: false });

    const csv2 = [
      'category,description,unit_of_measure,unit_cost_material,unit_cost_labor',
      'Drywall,Sound batt insulation,SF,1.00,0.60',
    ].join('\n');
    const r = await runImport({ ...ctx, buffer: Buffer.from(csv2), dryRun: false });
    expect(r.entriesToUpdate).toBe(1);
    expect(r.entriesToCreate).toBe(0);

    const entries = await prisma.priceBookEntry.findMany({
      where: { priceBookId: ctx.priceBookId },
    });
    expect(entries).toHaveLength(1);
    expect(String(entries[0]?.unitCostMaterial)).toBe('1');
  });

  it('does not commit when there are per-row errors; surfaces them in the response', async () => {
    const ctx = await makeOrgWithBook();
    const csv = [
      'category,description,unit_of_measure,unit_cost_material,unit_cost_labor',
      ',Missing category,SF,1,1',
      'Drywall,Valid row,SF,1,1',
    ].join('\n');
    const r = await runImport({ ...ctx, buffer: Buffer.from(csv), dryRun: false });
    expect(r.committed).toBe(false);
    expect(r.errorRows).toBe(1);
    expect(r.validRows).toBe(1);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);

    const entries = await prisma.priceBookEntry.count({
      where: { priceBookId: ctx.priceBookId },
    });
    expect(entries).toBe(0);
  });
});
