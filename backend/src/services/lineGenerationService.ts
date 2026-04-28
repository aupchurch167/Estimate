/**
 * Orchestrator for the GENERATE_LINE_ITEMS AI run.
 *
 * Loads the estimate context + sources + default price book, calls
 * aiService.createRun with the generateLineItems prompt, then translates
 * the validated output into DB rows: find-or-create scope sections by
 * name (case-insensitive), create AI_GENERATED line items with
 * snapshot pricing from any matched PriceBookEntry, and recompute the
 * parent estimate's totals. Regeneration soft-deletes the previous AI
 * lines but leaves MANUAL / PRICEBOOK / TEMPLATE lines alone.
 */

import { Prisma, type LineItemSource, type LineItemStatus, type ScopeSection } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { resolveMarkup, type MarkupRuleSlim } from '../lib/markup.js';
import { recomputeTotals } from './estimateService.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import {
  buildGenerateLineItemsPrompt,
  type GenerateLineItemsContext,
  type GenerateLineItemsOutput,
} from '../prompts/generateLineItems.js';
import { createRun } from './aiService.js';

const LOCKED_STATUSES = new Set(['SENT', 'WON', 'LOST']);

export interface GenerateLineItemsResult {
  runId: string;
  scopeSummary: string;
  assumptions: string[];
  sectionsCreated: number;
  lineItemsCreated: number;
  output: GenerateLineItemsOutput;
}

export async function generate(
  organizationId: string,
  userId: string,
  estimateId: string,
): Promise<GenerateLineItemsResult> {
  // 1. Validate estimate is editable.
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  if (LOCKED_STATUSES.has(estimate.status)) {
    throw new ConflictError(
      `Cannot generate line items while estimate is ${estimate.status}`,
      'cannot_edit_in_current_status',
      { status: estimate.status },
    );
  }

  // 2. Load context.
  const [sourceInputs, priceBook, settings] = await Promise.all([
    prisma.sourceInput.findMany({
      where: { estimateId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.priceBook.findFirst({
      where: { organizationId, isDefault: true, deletedAt: null },
      include: {
        categories: { where: { deletedAt: null }, orderBy: { order: 'asc' } },
        entries: {
          where: { deletedAt: null },
          select: {
            id: true,
            code: true,
            description: true,
            unitOfMeasure: true,
            aiKeywords: true,
            categoryId: true,
            unitCostMaterial: true,
            unitCostLabor: true,
            defaultMarkupPercent: true,
          },
        },
      },
    }),
    prisma.orgSettings.findUnique({ where: { organizationId } }),
  ]);

  if (!priceBook) {
    throw new ConflictError(
      'Default price book is missing — set one before generating estimates',
      'no_default_pricebook',
    );
  }
  if (!settings) {
    throw new NotFoundError('OrgSettings', organizationId);
  }

  const projectAddress = [
    estimate.projectAddressLine1,
    estimate.projectCity && estimate.projectState
      ? `${estimate.projectCity}, ${estimate.projectState}`
      : estimate.projectCity,
    estimate.projectPostalCode,
  ]
    .filter(Boolean)
    .join(' ');

  const ctx: GenerateLineItemsContext = {
    estimateTitle: estimate.title,
    estimateDescription: estimate.description,
    clientCompanyName: estimate.clientCompanyName,
    projectAddress: projectAddress.length > 0 ? projectAddress : null,
    sourceInputs: sourceInputs.map((s) => ({
      type: s.type,
      title: s.title,
      content: s.content,
    })),
    priceBookName: priceBook.name,
    categories: priceBook.categories,
    entries: priceBook.entries.map((e) => ({
      code: e.code,
      description: e.description,
      unitOfMeasure: e.unitOfMeasure,
      aiKeywords: e.aiKeywords,
      categoryId: e.categoryId,
    })),
  };

  const promptArtifacts = buildGenerateLineItemsPrompt(ctx);

  // 3. Run the AI. createRun handles cost cap + retries + AIRun bookkeeping.
  const { run, output } = await createRun({
    organizationId,
    estimateId,
    userId,
    runType: 'GENERATE_LINE_ITEMS',
    inputs: {
      sourceInputCount: sourceInputs.length,
      priceBookId: priceBook.id,
      estimateTitle: estimate.title,
    },
    systemPrompt: promptArtifacts.systemPrompt,
    userMessage: promptArtifacts.userMessage,
    toolName: promptArtifacts.toolName,
    toolDescription: promptArtifacts.toolDescription,
    toolInputSchema: promptArtifacts.toolInputSchema,
    outputSchema: promptArtifacts.outputSchema,
  });

  // 4. Persist the structured output.
  const result = await applyGeneratedOutput({
    organizationId,
    estimateId,
    runId: run.id,
    output,
    priceBook: {
      id: priceBook.id,
      categories: priceBook.categories,
      entries: priceBook.entries.map((e) => ({
        id: e.id,
        code: e.code,
        description: e.description,
        unitOfMeasure: e.unitOfMeasure,
        unitCostMaterial: e.unitCostMaterial.toString(),
        unitCostLabor: e.unitCostLabor.toString(),
        defaultMarkupPercent: e.defaultMarkupPercent?.toString() ?? null,
        categoryId: e.categoryId,
      })),
    },
    settings: {
      defaultMarkupPercent: settings.defaultMarkupPercent?.toString() ?? null,
    },
  });

  await recomputeTotals(estimateId);

  return {
    runId: run.id,
    scopeSummary: output.scopeSummary,
    assumptions: output.assumptions,
    ...result,
    output,
  };
}

// ─── Apply output ─────────────────────────────────────────────────────────

interface ApplyArgs {
  organizationId: string;
  estimateId: string;
  runId: string;
  output: GenerateLineItemsOutput;
  priceBook: {
    id: string;
    categories: { id: string; name: string; defaultMarkupPercent: Prisma.Decimal | null }[];
    entries: {
      id: string;
      code: string | null;
      description: string;
      unitOfMeasure:
        | 'SF'
        | 'LF'
        | 'CF'
        | 'EA'
        | 'HR'
        | 'DY'
        | 'LS'
        | 'CY'
        | 'SY'
        | 'GAL'
        | 'TON'
        | 'CUSTOM';
      unitCostMaterial: string;
      unitCostLabor: string;
      defaultMarkupPercent: string | null;
      categoryId: string;
    }[];
  };
  settings: { defaultMarkupPercent: string | null };
}

async function applyGeneratedOutput(args: ApplyArgs) {
  const markupRules = (await prisma.markupRule.findMany({
    where: { organizationId: args.organizationId, isActive: true, deletedAt: null },
  })) as MarkupRuleSlim[];

  const result = await prisma.$transaction(async (tx) => {
    // (a) Soft-delete previous AI_GENERATED line items only.
    await tx.lineItem.updateMany({
      where: { estimateId: args.estimateId, source: 'AI_GENERATED', deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // (b) Find existing sections so we can re-use them by case-insensitive name.
    const existingSections = await tx.scopeSection.findMany({
      where: { estimateId: args.estimateId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    const sectionByName = new Map<string, ScopeSection>();
    for (const s of existingSections) sectionByName.set(s.name.toLowerCase(), s);
    let nextOrder = existingSections.reduce((m, s) => (s.order > m ? s.order : m), -1) + 1;

    let sectionsCreated = 0;
    let lineItemsCreated = 0;

    for (const aiSection of args.output.sections) {
      const key = aiSection.name.toLowerCase();
      let section = sectionByName.get(key);
      if (!section) {
        const matchedCategory = args.priceBook.categories.find(
          (c) =>
            aiSection.categoryName &&
            c.name.toLowerCase() === aiSection.categoryName.toLowerCase(),
        );
        section = await tx.scopeSection.create({
          data: {
            organizationId: args.organizationId,
            estimateId: args.estimateId,
            name: aiSection.name,
            description: aiSection.description ?? null,
            categoryId: matchedCategory?.id ?? null,
            order: nextOrder++,
          },
        });
        sectionByName.set(key, section);
        sectionsCreated += 1;
      }

      // Position new AI lines at the bottom of the section.
      const max = await tx.lineItem.aggregate({
        where: { scopeSectionId: section.id, deletedAt: null },
        _max: { order: true },
      });
      let order = (max._max.order ?? -1) + 1;

      const matchedCategoryForSection = args.priceBook.categories.find(
        (c) => c.id === section!.categoryId,
      );

      for (const aiLine of aiSection.lineItems) {
        const matched = resolvePriceBookEntry(args.priceBook.entries, aiLine);

        const unitCostMaterial = matched ? matched.unitCostMaterial : '0';
        const unitCostLabor = matched ? matched.unitCostLabor : '0';
        const lineCategory = matched
          ? args.priceBook.categories.find((c) => c.id === matched.categoryId)
          : matchedCategoryForSection;

        const markupPercent = resolveMarkup({
          lineDescription: aiLine.description,
          section: { name: section.name, markupPercent: section.markupPercent?.toString() },
          category: lineCategory
            ? {
                id: lineCategory.id,
                name: lineCategory.name,
                defaultMarkupPercent: lineCategory.defaultMarkupPercent?.toString(),
              }
            : null,
          orgSettings: { defaultMarkupPercent: args.settings.defaultMarkupPercent },
          markupRules,
        });

        const qty = new Prisma.Decimal(aiLine.quantity);
        const unitTotal = new Prisma.Decimal(unitCostMaterial).plus(unitCostLabor);
        const lineCost = qty
          .times(unitTotal)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const lineSellPrice = lineCost
          .times(new Prisma.Decimal(1).plus(markupPercent))
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

        const status = pickStatus({
          matched: Boolean(matched),
          confidence: aiLine.aiConfidence,
        });

        await tx.lineItem.create({
          data: {
            organizationId: args.organizationId,
            estimateId: args.estimateId,
            scopeSectionId: section.id,
            priceBookEntryId: matched?.id ?? null,
            sourceRunId: args.runId,
            description: aiLine.description,
            quantity: qty.toString(),
            unitOfMeasure: matched?.unitOfMeasure ?? aiLine.unitOfMeasure,
            unitCostMaterial,
            unitCostLabor,
            markupPercent,
            lineCost,
            lineSellPrice,
            status,
            source: 'AI_GENERATED' satisfies LineItemSource,
            aiConfidence: aiLine.aiConfidence.toString(),
            aiAssumption: aiLine.aiAssumption,
            order: order++,
          },
        });

        if (matched) {
          await tx.priceBookEntry.update({
            where: { id: matched.id },
            data: {
              usageCount: { increment: 1 },
              lastUsedAt: new Date(),
            },
          });
        }
        lineItemsCreated += 1;
      }
    }

    return { sectionsCreated, lineItemsCreated };
  });
  return result;
}

function resolvePriceBookEntry(
  entries: ApplyArgs['priceBook']['entries'],
  aiLine: GenerateLineItemsOutput['sections'][number]['lineItems'][number],
) {
  if (aiLine.priceBookEntryCode) {
    const byCode = entries.find(
      (e) => e.code && e.code.toLowerCase() === aiLine.priceBookEntryCode!.toLowerCase(),
    );
    if (byCode) return byCode;
  }
  if (aiLine.priceBookEntryDescription) {
    const target = aiLine.priceBookEntryDescription.toLowerCase();
    const exact = entries.find((e) => e.description.toLowerCase() === target);
    if (exact) return exact;
    const startsWith = entries.find((e) => e.description.toLowerCase().startsWith(target));
    if (startsWith) return startsWith;
    const includes = entries.find((e) => e.description.toLowerCase().includes(target));
    if (includes) return includes;
  }
  return null;
}

function pickStatus(opts: { matched: boolean; confidence: number }): LineItemStatus {
  if (!opts.matched) return 'NO_PRICE';
  if (opts.confidence < 0.7) return 'NEEDS_REVIEW';
  return 'DRAFT';
}
