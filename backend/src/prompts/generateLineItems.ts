/**
 * Prompt builder for GENERATE_LINE_ITEMS.
 *
 * Pure function: takes the estimate metadata + active source inputs + a
 * shaped summary of the org's price book and produces:
 *   - systemPrompt
 *   - userMessage
 *   - toolName / toolDescription / toolInputSchema (Anthropic tool_use)
 *   - outputSchema (Zod schema for the same shape)
 *
 * Cost columns are intentionally left OUT of the price-book digest
 * passed to the model — descriptions + keywords + UoM are enough for
 * matching and keep the prompt small.
 */

import { z } from 'zod';
import type { PriceBookCategory, PriceBookEntry, SourceInput } from '@prisma/client';

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

export const generateLineItemsOutputSchema = z.object({
  scopeSummary: z.string().min(1).max(1500),
  assumptions: z.array(z.string().min(1).max(500)).max(50),
  sections: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(1000).optional().nullable(),
        categoryName: z.string().max(120).optional().nullable(),
        lineItems: z
          .array(
            z.object({
              description: z.string().min(1).max(500),
              quantity: z.number().positive(),
              unitOfMeasure: z.enum(UNITS),
              priceBookEntryCode: z.string().max(40).nullable(),
              priceBookEntryDescription: z.string().max(500).nullable(),
              aiConfidence: z.number().min(0).max(1),
              aiAssumption: z.string().max(500).nullable(),
            }),
          )
          .max(80),
      }),
    )
    .min(1)
    .max(20),
});

export type GenerateLineItemsOutput = z.infer<typeof generateLineItemsOutputSchema>;

export const TOOL_NAME = 'submit_line_items';
export const TOOL_DESCRIPTION =
  "Submit a structured first-draft estimate (sections + line items) for the human reviewer. Always emit ONE call with the full draft.";

export const TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scopeSummary', 'assumptions', 'sections'],
  properties: {
    scopeSummary: {
      type: 'string',
      description: '2–3 sentence narrative of the work in plain English.',
    },
    assumptions: {
      type: 'array',
      description: 'Plain-language assumptions the reviewer must verify.',
      items: { type: 'string' },
    },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'lineItems'],
        properties: {
          name: { type: 'string' },
          description: { type: ['string', 'null'] },
          categoryName: {
            type: ['string', 'null'],
            description:
              'Match one of the price book category names exactly when possible; otherwise null.',
          },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'description',
                'quantity',
                'unitOfMeasure',
                'priceBookEntryCode',
                'priceBookEntryDescription',
                'aiConfidence',
                'aiAssumption',
              ],
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number', minimum: 0 },
                unitOfMeasure: { type: 'string', enum: [...UNITS] },
                priceBookEntryCode: {
                  type: ['string', 'null'],
                  description:
                    'Set to the price book entry code when a confident match exists, else null.',
                },
                priceBookEntryDescription: {
                  type: ['string', 'null'],
                  description:
                    'Set to the closest price-book entry description (a hint for ambiguous matches), else null.',
                },
                aiConfidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description:
                    '0.9+ direct catalog match; 0.6-0.8 inferred quantity/scope; <0.6 anything shaky.',
                },
                aiAssumption: {
                  type: ['string', 'null'],
                  description: 'Per-line assumption — surfaced to the reviewer.',
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ─── Prompt text ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Quill — an estimating assistant for commercial construction.

Your job:
- Read the source materials a small GC has gathered (transcripts, emails, scope notes).
- Produce an 80% first-draft schedule of values: sections + line items, each with quantity, UoM, and a confidence score.
- A human estimator (often the GC's senior PM) will review and finalize. Your job is to surface every assumption you made so they don't get missed.

Hard rules:
- ALWAYS call the submit_line_items tool exactly once per response.
- Never hallucinate scope. If the sources don't say it, leave it out OR raise an assumption.
- Match line items to the org's price book entries by description + keywords whenever you reasonably can. Set priceBookEntryCode when confident; null when not.
- Confidence rubric: 0.9+ = direct catalog match with a clear quantity; 0.6-0.8 = inferred quantity or fuzzy match; <0.6 = anything shaky (the line will be flagged for human review).
- Prefer to use existing price-book category names for sections (categoryName) so markups inherit. If no fit, leave categoryName null.
- For sub-quoted scopes (HVAC, fire suppression, low-voltage), set priceBookEntryCode=null, aiConfidence=0.4, and aiAssumption='Sub-quote required'.
`;

export interface GenerateLineItemsContext {
  estimateTitle: string;
  estimateDescription: string | null;
  clientCompanyName: string | null;
  projectAddress: string | null;
  sourceInputs: Pick<SourceInput, 'type' | 'title' | 'content'>[];
  priceBookName: string;
  categories: PriceBookCategory[];
  entries: Pick<
    PriceBookEntry,
    'code' | 'description' | 'unitOfMeasure' | 'aiKeywords' | 'categoryId'
  >[];
}

export interface GenerateLineItemsPromptResult {
  systemPrompt: string;
  userMessage: string;
  toolName: string;
  toolDescription: string;
  toolInputSchema: object;
  outputSchema: typeof generateLineItemsOutputSchema;
}

export function buildGenerateLineItemsPrompt(
  ctx: GenerateLineItemsContext,
): GenerateLineItemsPromptResult {
  const lines: string[] = [];

  lines.push(`# Estimate to draft`);
  lines.push(`Title: ${ctx.estimateTitle}`);
  if (ctx.clientCompanyName) lines.push(`Client: ${ctx.clientCompanyName}`);
  if (ctx.projectAddress) lines.push(`Project address: ${ctx.projectAddress}`);
  if (ctx.estimateDescription) lines.push(`Notes: ${ctx.estimateDescription}`);

  lines.push('');
  lines.push(`# Sources (${ctx.sourceInputs.length})`);
  if (ctx.sourceInputs.length === 0) {
    lines.push(
      'NONE — the drafter has not added any sources. Make a best-effort schedule from the title alone, but surface "no sources provided" as an assumption.',
    );
  } else {
    ctx.sourceInputs.forEach((s, i) => {
      lines.push(`--- SOURCE ${i + 1}: ${s.type} — ${s.title}`);
      lines.push(s.content?.trim() ?? '(no inline content)');
      lines.push('');
    });
  }

  lines.push('');
  lines.push(`# Price book — ${ctx.priceBookName}`);
  lines.push('Match line items to these entries by description + keywords + UoM.');
  lines.push('Costs are NOT included on purpose; you only need to identify the catalog row.');
  lines.push('');
  const byCategory = new Map<string, typeof ctx.entries>();
  for (const cat of ctx.categories) byCategory.set(cat.id, []);
  for (const entry of ctx.entries) {
    if (entry.categoryId && byCategory.has(entry.categoryId)) {
      byCategory.get(entry.categoryId)!.push(entry);
    }
  }
  for (const cat of ctx.categories) {
    const entries = byCategory.get(cat.id) ?? [];
    if (entries.length === 0) continue;
    lines.push(`## ${cat.name}`);
    for (const e of entries) {
      const code = e.code ? `[${e.code}] ` : '';
      const kw = e.aiKeywords ? ` — keywords: ${e.aiKeywords}` : '';
      lines.push(`  ${code}${e.unitOfMeasure} — ${e.description}${kw}`);
    }
    lines.push('');
  }

  lines.push('');
  lines.push('# Output');
  lines.push(
    'Call the submit_line_items tool with one ScopeSection per phase of work. Inside each section, list every billable line. Always include aiConfidence per line. Surface every meaningful assumption in the top-level assumptions array AND inline on the line.',
  );

  return {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: lines.join('\n'),
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolInputSchema: TOOL_INPUT_SCHEMA,
    outputSchema: generateLineItemsOutputSchema,
  };
}
