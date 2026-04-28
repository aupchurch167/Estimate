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
 * Output is conversational: short text reply plus an optional
 * `suggestedAction` hint so the UI can offer an inline "Re-draft now" CTA
 * when Claude thinks the change warrants regeneration.
 */

import { z } from 'zod';
import type { AIMessage, SourceInput } from '@prisma/client';
import type { GenerateLineItemsOutput } from './generateLineItems.js';

export const SUGGESTED_ACTIONS = ['none', 'regenerate_line_items'] as const;
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];

export const askFollowupOutputSchema = z.object({
  assistantMessage: z.string().min(1).max(2000),
  suggestedAction: z.enum(SUGGESTED_ACTIONS),
});

export type AskFollowupOutput = z.infer<typeof askFollowupOutputSchema>;

export const TOOL_NAME = 'submit_followup_response';
export const TOOL_DESCRIPTION =
  "Submit a short conversational reply to the estimator's follow-up. Always emit ONE call.";

export const TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assistantMessage', 'suggestedAction'],
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
        "Set to 'regenerate_line_items' ONLY when the change clearly invalidates the current draft (new scope, different price book, removed sections). Otherwise 'none'.",
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
- Set suggestedAction='regenerate_line_items' ONLY when your answer materially
  changes scope or pricing assumptions (e.g. "use a different ceiling tile",
  "drop the demolition section"). For most clarifying questions, return 'none'.
`;

export interface AskFollowupContext {
  estimateTitle: string;
  estimateDescription: string | null;
  clientCompanyName: string | null;
  sourceInputs: Pick<SourceInput, 'type' | 'title' | 'content'>[];
  /** The latest SUCCEEDED GENERATE_LINE_ITEMS output, if any. */
  latestDraft: GenerateLineItemsOutput | null;
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
  lines.push(`# Current draft`);
  if (!ctx.latestDraft) {
    lines.push('No draft has been generated yet.');
  } else {
    lines.push(`Summary: ${ctx.latestDraft.scopeSummary}`);
    if (ctx.latestDraft.assumptions.length > 0) {
      lines.push('Assumptions:');
      for (const a of ctx.latestDraft.assumptions) lines.push(`  - ${a}`);
    }
    for (const section of ctx.latestDraft.sections) {
      lines.push(`## ${section.name}`);
      for (const li of section.lineItems) {
        lines.push(
          `  - ${li.description} — ${li.quantity} ${li.unitOfMeasure}` +
            (li.priceBookEntryCode ? ` [${li.priceBookEntryCode}]` : ' [unmatched]'),
        );
      }
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
    'Call the submit_followup_response tool with a short reply (1-3 sentences) and a suggestedAction.',
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
