/**
 * Prompt builder for ASK_FOLLOWUP.
 *
 * Pure function: takes the estimate metadata, the active source inputs,
 * the latest GENERATE run output (if any), the prior conversation, and
 * the user's new message. Produces:
 *   - systemPrompt
 *   - userMessage (the chat-style transcript that ends with the new ask)
 *   - toolName / toolDescription / toolInputSchema (Anthropic tool_use)
 *   - outputSchema (Zod schema for the same shape)
 *
 * Output is conversational: short text reply plus optional structured
 * `proposedActions` (ADD_LINE_ITEM / UPDATE_LINE_ITEM / REMOVE_LINE_ITEM /
 * ADD_SECTION) the UI surfaces as an "Apply" card. We also keep the
 * older `suggestedAction` enum for the "Re-draft now" CTA.
 */

import { z } from 'zod';
import type { AIMessage, SourceInput } from '@prisma/client';
import type { GenerateLineItemsOutput } from './generateLineItems.js';

export const SUGGESTED_ACTIONS = ['none', 'regenerate_line_items'] as const;
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];

const UOM_VALUES = [
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
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const MAX_PROPOSED_ACTIONS = 10;

const addLineItemSchema = z.object({
  type: z.literal('ADD_LINE_ITEM'),
  scopeSectionId: z.string().min(1).max(40),
  description: z.string().min(1).max(500),
  quantity: z.string().regex(DECIMAL_RE, 'Decimal string'),
  unitOfMeasure: z.enum(UOM_VALUES),
  aiAssumption: z.string().max(500).nullable().optional(),
});

const updateLineItemSchema = z.object({
  type: z.literal('UPDATE_LINE_ITEM'),
  lineItemId: z.string().min(1).max(40),
  description: z.string().min(1).max(500).optional(),
  quantity: z.string().regex(DECIMAL_RE, 'Decimal string').optional(),
  unitOfMeasure: z.enum(UOM_VALUES).optional(),
  aiAssumption: z.string().max(500).nullable().optional(),
});

const removeLineItemSchema = z.object({
  type: z.literal('REMOVE_LINE_ITEM'),
  lineItemId: z.string().min(1).max(40),
});

const addSectionSchema = z.object({
  type: z.literal('ADD_SECTION'),
  name: z.string().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
});

export const proposedActionSchema = z.discriminatedUnion('type', [
  addLineItemSchema,
  updateLineItemSchema,
  removeLineItemSchema,
  addSectionSchema,
]);

export type ProposedAction = z.infer<typeof proposedActionSchema>;

export const askFollowupOutputSchema = z.object({
  assistantMessage: z.string().min(1).max(2000),
  suggestedAction: z.enum(SUGGESTED_ACTIONS),
  proposedActions: z.array(proposedActionSchema).max(MAX_PROPOSED_ACTIONS),
});

export type AskFollowupOutput = z.infer<typeof askFollowupOutputSchema>;

export const TOOL_NAME = 'submit_followup_response';
export const TOOL_DESCRIPTION =
  "Submit a short conversational reply to the estimator's follow-up. " +
  'Optionally include structured proposedActions (max 10) when the request is a concrete edit ' +
  '(add/update/remove a line item, add a section). Always emit ONE call.';

export const TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assistantMessage', 'suggestedAction', 'proposedActions'],
  properties: {
    assistantMessage: {
      type: 'string',
      description:
        '1-3 sentence reply in plain English. Reference specific line items or assumptions when useful.',
    },
    suggestedAction: {
      type: 'string',
      enum: [...SUGGESTED_ACTIONS],
      description:
        "Set to 'regenerate_line_items' ONLY when the change clearly invalidates the current draft (new scope, different price book, removed sections). Otherwise 'none'. Do NOT set this when you have already populated proposedActions — let the structured edits stand on their own.",
    },
    proposedActions: {
      type: 'array',
      maxItems: MAX_PROPOSED_ACTIONS,
      description:
        'Concrete patches to apply. Use ONLY when the estimator asks for a specific edit. ' +
        'Leave empty for clarifying questions, explanations, or when you are unsure. ' +
        'Reference existing line items / sections by the IDs in the "Schedule" block.',
      items: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'scopeSectionId', 'description', 'quantity', 'unitOfMeasure'],
            properties: {
              type: { const: 'ADD_LINE_ITEM' },
              scopeSectionId: { type: 'string' },
              description: { type: 'string' },
              quantity: {
                type: 'string',
                description: 'Decimal as string (e.g. "120", "0.5").',
              },
              unitOfMeasure: { enum: [...UOM_VALUES] },
              aiAssumption: { type: ['string', 'null'] },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'lineItemId'],
            properties: {
              type: { const: 'UPDATE_LINE_ITEM' },
              lineItemId: { type: 'string' },
              description: { type: 'string' },
              quantity: { type: 'string' },
              unitOfMeasure: { enum: [...UOM_VALUES] },
              aiAssumption: { type: ['string', 'null'] },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'lineItemId'],
            properties: {
              type: { const: 'REMOVE_LINE_ITEM' },
              lineItemId: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'name'],
            properties: {
              type: { const: 'ADD_SECTION' },
              name: { type: 'string' },
              description: { type: ['string', 'null'] },
            },
          },
        ],
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are Quill — an estimating assistant for commercial construction.

You are talking to a senior estimator about an in-progress estimate. They may
ask you to clarify an assumption, suggest a different approach, explain a
line item, or talk through a change order. Be concise (1-3 sentences). Be
specific — reference section names, line descriptions, or assumptions when
relevant. Never invent numbers; if you don't know, say so.

Hard rules:
- ALWAYS call the submit_followup_response tool exactly once per response.
- Plain English only — no markdown headers, no bullet lists.
- proposedActions is the structured-edit channel:
  * Use it ONLY when the estimator asks for a concrete edit ("add a line for
    paint touch-up at 200 SF in demo", "remove the framing line", "rename
    section A to Demolition", "set the demo qty to 250").
  * Reference existing line items / sections by the IDs shown in the
    "Schedule" block. NEVER invent IDs. If you can't find a matching ID,
    leave proposedActions empty and ask the estimator to clarify.
  * For ADD_LINE_ITEM, pick a scopeSectionId from the Schedule block. Do
    not invent a new section unless the estimator explicitly asked for one
    (then emit ADD_SECTION first and explain in your reply that the section
    needs to be created before lines can land in it).
  * For numeric quantities, return a plain decimal string (e.g. "100",
    "0.5"). Never include units in the quantity string.
  * Cap proposedActions at ${MAX_PROPOSED_ACTIONS}. If the change is bigger
    than that, leave proposedActions empty and recommend a regenerate.
- For clarifying questions, explanations, or anything ambiguous, leave
  proposedActions empty.
- Set suggestedAction='regenerate_line_items' ONLY when your answer materially
  changes scope or pricing assumptions in a way that's bigger than a small
  patch (e.g. "use a different ceiling tile across the whole job", "drop
  demolition entirely"). For most clarifying questions, return 'none'. If
  you populated proposedActions, return 'none' — let the patches stand.
`;

export interface AskFollowupContext {
  estimateTitle: string;
  estimateDescription: string | null;
  clientCompanyName: string | null;
  sourceInputs: Pick<SourceInput, 'type' | 'title' | 'content'>[];
  /** The latest SUCCEEDED GENERATE_LINE_ITEMS output, if any. */
  latestDraft: GenerateLineItemsOutput | null;
  /** Sections + line items live in the DB — always include their IDs so
   *  the model can target structured edits. */
  schedule: {
    sectionId: string;
    name: string;
    items: { lineItemId: string; description: string; quantity: string; unitOfMeasure: string }[];
  }[];
  /** Prior chat history, oldest first. */
  history: Pick<AIMessage, 'role' | 'content'>[];
  /** The new user message. */
  userText: string;
}

export interface AskFollowupPromptResult {
  systemPrompt: string;
  userMessage: string;
  toolName: string;
  toolDescription: string;
  toolInputSchema: object;
  outputSchema: typeof askFollowupOutputSchema;
}

export function buildAskFollowupPrompt(ctx: AskFollowupContext): AskFollowupPromptResult {
  const lines: string[] = [];

  lines.push(`# Estimate`);
  lines.push(`Title: ${ctx.estimateTitle}`);
  if (ctx.clientCompanyName) lines.push(`Client: ${ctx.clientCompanyName}`);
  if (ctx.estimateDescription) lines.push(`Notes: ${ctx.estimateDescription}`);

  lines.push('');
  lines.push(`# Sources (${ctx.sourceInputs.length})`);
  if (ctx.sourceInputs.length === 0) {
    lines.push('NONE — no sources have been uploaded yet.');
  } else {
    ctx.sourceInputs.forEach((s, i) => {
      lines.push(`--- SOURCE ${i + 1}: ${s.type} — ${s.title}`);
      lines.push(s.content?.trim() ?? '(no inline content)');
      lines.push('');
    });
  }

  lines.push('');
  lines.push(`# Schedule (current state — use these IDs for proposedActions)`);
  if (ctx.schedule.length === 0) {
    lines.push('No sections or line items exist yet.');
  } else {
    for (const section of ctx.schedule) {
      lines.push(`Section [${section.sectionId}] ${section.name}`);
      if (section.items.length === 0) {
        lines.push('  (no line items)');
      } else {
        for (const it of section.items) {
          lines.push(
            `  Line [${it.lineItemId}] ${it.description} — ${it.quantity} ${it.unitOfMeasure}`,
          );
        }
      }
    }
  }

  if (ctx.latestDraft) {
    lines.push('');
    lines.push(`# Latest draft summary`);
    lines.push(`Summary: ${ctx.latestDraft.scopeSummary}`);
    if (ctx.latestDraft.assumptions.length > 0) {
      lines.push('Assumptions:');
      for (const a of ctx.latestDraft.assumptions) lines.push(`  - ${a}`);
    }
  }

  if (ctx.history.length > 0) {
    lines.push('');
    lines.push(`# Conversation so far`);
    for (const m of ctx.history) {
      const tag = m.role === 'USER' ? 'Estimator' : m.role === 'ASSISTANT' ? 'Quill' : m.role;
      lines.push(`${tag}: ${m.content}`);
    }
  }

  lines.push('');
  lines.push(`# New question from the estimator`);
  lines.push(ctx.userText);

  lines.push('');
  lines.push('# Output');
  lines.push(
    'Call the submit_followup_response tool with a short reply (1-3 sentences), a suggestedAction, and proposedActions (empty array if no concrete edit was requested).',
  );

  return {
    systemPrompt: SYSTEM_PROMPT,
    userMessage: lines.join('\n'),
    toolName: TOOL_NAME,
    toolDescription: TOOL_DESCRIPTION,
    toolInputSchema: TOOL_INPUT_SCHEMA,
    outputSchema: askFollowupOutputSchema,
  };
}
