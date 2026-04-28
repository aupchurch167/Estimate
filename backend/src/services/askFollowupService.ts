/**
 * Orchestrator for the ASK_FOLLOWUP AI run.
 *
 * Loads the estimate context + prior conversation + latest GENERATE run
 * output (if any), appends the user's message FIRST so the chat UI shows
 * it immediately, then calls aiService.createRun. On success, appends the
 * assistant's reply tied to the new run's id. The user message is
 * persisted regardless of whether the AI call succeeds — this matches
 * standard chat semantics and lets the user retry without losing what
 * they typed.
 */

import { prisma } from '../lib/prisma.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import {
  appendMessage,
  createRun,
  ensureConversation,
} from './aiService.js';
import {
  buildAskFollowupPrompt,
  type AskFollowupOutput,
  type AskFollowupContext,
} from '../prompts/askFollowup.js';
import type { GenerateLineItemsOutput } from '../prompts/generateLineItems.js';

const LOCKED_STATUSES = new Set(['SENT', 'WON', 'LOST']);
const HISTORY_LIMIT = 20;

export interface AskFollowupResult {
  runId: string;
  assistantMessage: string;
  suggestedAction: AskFollowupOutput['suggestedAction'];
  output: AskFollowupOutput;
}

export async function ask(
  organizationId: string,
  userId: string,
  estimateId: string,
  rawUserText: string,
): Promise<AskFollowupResult> {
  const userText = rawUserText.trim();
  if (userText.length === 0) {
    throw new ValidationError('userText cannot be empty', {
      issues: [{ path: 'userText', message: 'Required' }],
    });
  }
  if (userText.length > 2000) {
    throw new ValidationError('userText is too long (max 2000 chars)', {
      issues: [{ path: 'userText', message: 'Too long' }],
    });
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, organizationId, deletedAt: null },
  });
  if (!estimate) throw new NotFoundError('Estimate', estimateId);
  if (LOCKED_STATUSES.has(estimate.status)) {
    throw new ConflictError(
      `Cannot continue the conversation while estimate is ${estimate.status}`,
      'cannot_edit_in_current_status',
      { status: estimate.status },
    );
  }

  // 1. Ensure conversation + persist USER message immediately so the chat
  //    UI can echo it even if the AI call fails.
  const conversation = await ensureConversation(organizationId, estimateId);
  await appendMessage({
    organizationId,
    conversationId: conversation.id,
    role: 'USER',
    content: userText,
    authorUserId: userId,
  });

  // 2. Load context: sources, prior history, latest GENERATE run output.
  const [sourceInputs, history, latestGenerateRun] = await Promise.all([
    prisma.sourceInput.findMany({
      where: { estimateId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.aIMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { order: 'asc' },
      take: HISTORY_LIMIT,
    }),
    prisma.aIRun.findFirst({
      where: {
        organizationId,
        estimateId,
        runType: 'GENERATE_LINE_ITEMS',
        status: 'SUCCEEDED',
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // The history we just loaded already includes the USER message we
  // appended a moment ago — drop it from the chat-history block so it
  // only appears once (under "New question from the estimator").
  const priorHistory = history
    .filter((m) => !(m.role === 'USER' && m.content === userText))
    .slice(-HISTORY_LIMIT);

  const ctx: AskFollowupContext = {
    estimateTitle: estimate.title,
    estimateDescription: estimate.description,
    clientCompanyName: estimate.clientCompanyName,
    sourceInputs: sourceInputs.map((s) => ({
      type: s.type,
      title: s.title,
      content: s.content,
    })),
    latestDraft: (latestGenerateRun?.outputs as GenerateLineItemsOutput | null) ?? null,
    history: priorHistory.map((m) => ({ role: m.role, content: m.content })),
    userText,
  };

  const promptArtifacts = buildAskFollowupPrompt(ctx);

  // 3. Run the AI on the cheaper Haiku tier — follow-ups are short.
  const { run, output } = await createRun({
    organizationId,
    estimateId,
    userId,
    runType: 'ASK_FOLLOWUP',
    modelTier: 'light',
    inputs: {
      userTextLength: userText.length,
      hasDraft: Boolean(latestGenerateRun),
      historyCount: priorHistory.length,
    },
    systemPrompt: promptArtifacts.systemPrompt,
    userMessage: promptArtifacts.userMessage,
    toolName: promptArtifacts.toolName,
    toolDescription: promptArtifacts.toolDescription,
    toolInputSchema: promptArtifacts.toolInputSchema,
    outputSchema: promptArtifacts.outputSchema,
  });

  // 4. Persist the ASSISTANT reply.
  await appendMessage({
    organizationId,
    conversationId: conversation.id,
    role: 'ASSISTANT',
    content: output.assistantMessage,
    runId: run.id,
  });

  return {
    runId: run.id,
    assistantMessage: output.assistantMessage,
    suggestedAction: output.suggestedAction,
    output,
  };
}
