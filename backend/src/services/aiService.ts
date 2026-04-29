/**
 * AI service.
 *
 * Phase 3.1: infrastructure only. The actual GENERATE_LINE_ITEMS prompt
 * lands in 3.2; the follow-up prompt in 3.4. This module owns:
 *
 *  - ensureConversation(estimateId): one-to-one AIConversation, lazy-created
 *    on first AI interaction with the estimate.
 *  - checkCostCap(orgId): rolls up the org's calendar-month AIRun costs
 *    against OrgSettings.monthlyAiCostCapUsd. Null cap = unlimited.
 *  - createRun(...): the workhorse. Records an AIRun (PENDING → RUNNING →
 *    SUCCEEDED|FAILED|CANCELLED), enforces the cap, calls Claude with a
 *    forced tool_use for structured output, validates with the caller's
 *    Zod schema, retries once on schema/parse failure, and updates the
 *    AIConversation aggregates (totalTokensInput, totalTokensOutput,
 *    totalCostUsd) atomically.
 *  - appendMessage(...): writes an AIMessage and bumps the conversation
 *    aggregates.
 */

import { Prisma, type AIConversation, type AIMessageRole, type AIRun, type AIRunType } from '@prisma/client';
import type { ZodSchema } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { AiUpstreamError, ConflictError, NotFoundError } from '../lib/errors.js';
import { getAnthropicClient } from '../lib/anthropic.js';
import { tokenCostDecimal } from '../lib/costing.js';
import * as notifications from './notificationService.js';

const ANTHROPIC_MAX_TOKENS = 4096;
const SCHEMA_RETRIES = 1; // i.e. up to 2 attempts total

// ─── Conversation ─────────────────────────────────────────────────────────

export async function ensureConversation(
  organizationId: string,
  estimateId: string,
  modelVersion: string = env.AI_MODEL_PRIMARY,
): Promise<AIConversation> {
  const existing = await prisma.aIConversation.findUnique({ where: { estimateId } });
  if (existing) return existing;
  return prisma.aIConversation.create({
    data: { organizationId, estimateId, modelVersion },
  });
}

// ─── Cost cap ─────────────────────────────────────────────────────────────

export interface CostCapStatus {
  blocked: boolean;
  capUsd: number | null;
  monthToDateUsd: number;
}

export async function checkCostCap(organizationId: string): Promise<CostCapStatus> {
  const settings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  if (!settings) throw new NotFoundError('OrgSettings', organizationId);

  const cap = settings.monthlyAiCostCapUsd;
  const monthStart = startOfCurrentMonth();
  const result = await prisma.aIRun.aggregate({
    where: {
      organizationId,
      // Count both successful AND failed runs — failed runs still consume
      // tokens. Cancelled runs (cap-blocked) have costUsd=null and are
      // skipped by the SUM.
      status: { in: ['SUCCEEDED', 'FAILED'] },
      createdAt: { gte: monthStart },
    },
    _sum: { costUsd: true },
  });
  const monthToDateUsd = Number(result._sum.costUsd ?? 0);
  if (cap === null || cap === undefined) {
    return { blocked: false, capUsd: null, monthToDateUsd };
  }
  const capNum = Number(cap);
  return {
    blocked: monthToDateUsd >= capNum,
    capUsd: capNum,
    monthToDateUsd,
  };
}

function startOfCurrentMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// ─── createRun ────────────────────────────────────────────────────────────

export interface CreateRunArgs<T> {
  organizationId: string;
  estimateId: string;
  userId: string;
  runType: AIRunType;
  inputs: Prisma.InputJsonValue;
  modelTier?: 'primary' | 'light';
  /** System prompt and the user message — caller already templated them. */
  systemPrompt: string;
  userMessage: string;
  /** Tool name + JSON schema that Anthropic will be forced to call. */
  toolName: string;
  toolDescription: string;
  toolInputSchema: object;
  /** Zod schema we validate the tool input against. */
  outputSchema: ZodSchema<T>;
}

export interface CreateRunResult<T> {
  run: AIRun;
  output: T;
}

export class MonthlyAiLimitError extends ConflictError {
  constructor(public readonly run: AIRun, status: CostCapStatus) {
    super(
      `Monthly AI cost cap reached ($${status.monthToDateUsd.toFixed(2)} of $${status.capUsd?.toFixed(2)}). Contact an admin to raise the cap or wait until next month.`,
      'monthly_ai_limit_reached',
      { capUsd: status.capUsd, monthToDateUsd: status.monthToDateUsd },
    );
  }
}

export async function createRun<T>(args: CreateRunArgs<T>): Promise<CreateRunResult<T>> {
  const conversation = await ensureConversation(args.organizationId, args.estimateId);

  // 1. Cost cap pre-flight.
  const cap = await checkCostCap(args.organizationId);
  if (cap.blocked) {
    const cancelled = await prisma.aIRun.create({
      data: {
        organizationId: args.organizationId,
        conversationId: conversation.id,
        estimateId: args.estimateId,
        triggeredById: args.userId,
        runType: args.runType,
        status: 'CANCELLED',
        inputs: args.inputs,
        errorMessage: 'monthly_ai_limit_reached',
        modelVersion: 'n/a',
      },
    });
    throw new MonthlyAiLimitError(cancelled, cap);
  }

  const model = args.modelTier === 'light' ? env.AI_MODEL_LIGHT : env.AI_MODEL_PRIMARY;

  const initialRun = await prisma.aIRun.create({
    data: {
      organizationId: args.organizationId,
      conversationId: conversation.id,
      estimateId: args.estimateId,
      triggeredById: args.userId,
      runType: args.runType,
      status: 'RUNNING',
      inputs: args.inputs,
      modelVersion: model,
    },
  });

  const start = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= SCHEMA_RETRIES; attempt++) {
    try {
      const response = await getAnthropicClient().messages.create({
        model,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system: args.systemPrompt,
        tools: [
          {
            name: args.toolName,
            description: args.toolDescription,
            input_schema: args.toolInputSchema as never,
          },
        ],
        tool_choice: { type: 'tool', name: args.toolName },
        messages: [{ role: 'user', content: attemptUserMessage(args.userMessage, attempt, lastError) }],
      });

      inputTokens += response.usage?.input_tokens ?? 0;
      outputTokens += response.usage?.output_tokens ?? 0;

      const toolBlock = response.content.find((block) => block.type === 'tool_use');
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        throw new Error('No tool_use block in Anthropic response');
      }
      const parsed = args.outputSchema.safeParse(toolBlock.input);
      if (!parsed.success) {
        lastError = new Error(`Output schema mismatch: ${parsed.error.message}`);
        continue;
      }

      const costUsd = tokenCostDecimal(model, inputTokens, outputTokens);
      const completed = await prisma.$transaction(async (tx) => {
        const updated = await tx.aIRun.update({
          where: { id: initialRun.id },
          data: {
            status: 'SUCCEEDED',
            outputs: parsed.data as Prisma.InputJsonValue,
            tokensInput: inputTokens,
            tokensOutput: outputTokens,
            costUsd,
            durationMs: Date.now() - start,
            completedAt: new Date(),
          },
        });
        await tx.aIConversation.update({
          where: { id: conversation.id },
          data: {
            totalTokensInput: { increment: inputTokens },
            totalTokensOutput: { increment: outputTokens },
            totalCostUsd: { increment: new Prisma.Decimal(costUsd) },
            lastMessageAt: new Date(),
          },
        });
        return updated;
      });
      return { run: completed, output: parsed.data };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        { err: lastError, runId: initialRun.id, attempt },
        '[ai] run attempt failed',
      );
      // Permanent upstream failures (bad key, missing model, …) won't get
      // better with a retry — bail out of the loop and let the FAILED
      // bookkeeping below run, then throw the typed AiUpstreamError.
      const mapped = mapAnthropicError(lastError, model);
      if (mapped && mapped.permanent) {
        lastError = mapped.error;
        break;
      }
    }
  }

  // All retries exhausted — mark FAILED with the last error.
  const costUsd = tokenCostDecimal(model, inputTokens, outputTokens);
  await prisma.$transaction(async (tx) => {
    await tx.aIRun.update({
      where: { id: initialRun.id },
      data: {
        status: 'FAILED',
        tokensInput: inputTokens,
        tokensOutput: outputTokens,
        costUsd,
        durationMs: Date.now() - start,
        completedAt: new Date(),
        errorMessage: lastError?.message ?? 'Unknown AI failure',
      },
    });
    if (inputTokens > 0 || outputTokens > 0) {
      await tx.aIConversation.update({
        where: { id: conversation.id },
        data: {
          totalTokensInput: { increment: inputTokens },
          totalTokensOutput: { increment: outputTokens },
          totalCostUsd: { increment: new Prisma.Decimal(costUsd) },
          lastMessageAt: new Date(),
        },
      });
    }
  });

  // Notify the user who triggered the run so they don't keep wondering
  // why nothing happened. Best-effort, fire-and-forget so the typed
  // upstream error still surfaces immediately.
  void notifyAiRunFailure({
    organizationId: args.organizationId,
    estimateId: args.estimateId,
    triggeredById: args.userId,
    runType: args.runType,
    errorMessage: lastError?.message ?? 'Unknown AI failure',
  });

  // Re-map at the boundary in case we got here without an early break
  // (e.g. transient errors that exhausted retries).
  if (lastError) {
    const mapped = mapAnthropicError(lastError, model);
    if (mapped) throw mapped.error;
  }
  throw lastError ?? new Error('Unknown AI failure');
}

async function notifyAiRunFailure(args: {
  organizationId: string;
  estimateId: string;
  triggeredById: string;
  runType: AIRunType;
  errorMessage: string;
}): Promise<void> {
  try {
    const estimate = await prisma.estimate.findFirst({
      where: { id: args.estimateId, organizationId: args.organizationId },
      select: { id: true, number: true, title: true },
    });
    if (!estimate) return;
    const errorCode = args.errorMessage.match(/ai_[a-z_]+/)?.[0] ?? 'internal_error';
    await notifications.notify({
      organizationId: args.organizationId,
      recipientId: args.triggeredById,
      type: 'AI_RUN_FAILED',
      title: `AI run failed on estimate ${estimate.number}`,
      body: args.errorMessage.length > 240
        ? `${args.errorMessage.slice(0, 237)}…`
        : args.errorMessage,
      entityType: 'Estimate',
      entityId: estimate.id,
      templateData: {
        template: 'AI_RUN_FAILED',
        estimateNumber: estimate.number,
        estimateTitle: estimate.title,
        estimateId: estimate.id,
        runTypeLabel: humanRunType(args.runType),
        errorCode,
      },
    });
  } catch (err) {
    logger.warn({ err }, '[ai] AI_RUN_FAILED notification dispatch threw');
  }
}

function humanRunType(t: AIRunType): string {
  switch (t) {
    case 'GENERATE_LINE_ITEMS':
      return 'Generate line items';
    case 'ASK_FOLLOWUP':
      return 'Follow-up';
    case 'DRAFT_EXEC_SUMMARY':
      return 'Executive summary';
    case 'SUGGEST_PRICE':
      return 'Price suggestion';
    case 'CLASSIFY_SCOPE':
      return 'Scope classification';
    default:
      return 'AI';
  }
}

/**
 * Translate raw Anthropic SDK errors into typed AiUpstreamErrors so
 * the controller can return useful 4xx/5xx codes and the frontend can
 * render a friendly banner. Returns { permanent: true } for errors we
 * shouldn't retry (bad key, wrong model name, schema mismatch from the
 * model that won't self-correct).
 */
function mapAnthropicError(
  err: Error,
  model: string,
): { error: AiUpstreamError; permanent: boolean } | null {
  // Anthropic SDK errors carry `status` + a structured `error` payload.
  const anthroLike = err as Error & {
    status?: number;
    error?: { error?: { type?: string; message?: string } };
  };
  const status = anthroLike.status;
  const upstreamType = anthroLike.error?.error?.type;
  const upstreamMessage = anthroLike.error?.error?.message;

  if (status === 401 || upstreamType === 'authentication_error') {
    return {
      permanent: true,
      error: new AiUpstreamError(
        'Anthropic rejected the API key. An admin needs to update ANTHROPIC_API_KEY in the backend environment and restart the server.',
        'ai_invalid_api_key',
        502,
        { upstreamMessage },
      ),
    };
  }
  if (status === 403 || upstreamType === 'permission_error') {
    return {
      permanent: true,
      error: new AiUpstreamError(
        'The Anthropic key is valid but lacks access to the requested model.',
        'ai_permission_denied',
        502,
        { upstreamMessage, model },
      ),
    };
  }
  if (status === 404 || upstreamType === 'not_found_error') {
    return {
      permanent: true,
      error: new AiUpstreamError(
        `Anthropic does not recognize model "${model}". Check AI_MODEL_PRIMARY / AI_MODEL_LIGHT in the backend environment.`,
        'ai_model_not_found',
        502,
        { upstreamMessage, model },
      ),
    };
  }
  if (status === 429 || upstreamType === 'rate_limit_error') {
    return {
      permanent: false,
      error: new AiUpstreamError(
        'Anthropic rate-limited this request. Wait a moment and try again.',
        'ai_rate_limited',
        503,
        { upstreamMessage },
      ),
    };
  }
  if (status === 529 || upstreamType === 'overloaded_error') {
    return {
      permanent: false,
      error: new AiUpstreamError(
        'Anthropic is temporarily overloaded. Try again shortly.',
        'ai_overloaded',
        503,
        { upstreamMessage },
      ),
    };
  }
  if (typeof status === 'number' && status >= 500) {
    return {
      permanent: false,
      error: new AiUpstreamError(
        'Anthropic returned a temporary error. Try again shortly.',
        'ai_temporary_failure',
        502,
        { status, upstreamMessage },
      ),
    };
  }
  // Network-level failures (no `status`).
  if (err.message?.toLowerCase().includes('connection error') || err.name === 'APIConnectionError') {
    return {
      permanent: false,
      error: new AiUpstreamError(
        'Could not reach Anthropic. Check your network connection.',
        'ai_network_error',
        502,
      ),
    };
  }
  return null;
}

function attemptUserMessage(
  base: string,
  attempt: number,
  lastError: Error | undefined,
): string {
  if (attempt === 0 || !lastError) return base;
  return [
    base,
    '',
    `IMPORTANT: your previous tool call had a schema mismatch — "${lastError.message.slice(0, 500)}". Re-emit a corrected tool call that exactly matches the expected schema.`,
  ].join('\n');
}

// ─── Messages ─────────────────────────────────────────────────────────────

export interface AppendMessageInput {
  organizationId: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  authorUserId?: string | null;
  runId?: string | null;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: string;
}

export async function appendMessage(input: AppendMessageInput) {
  return prisma.$transaction(async (tx) => {
    const conv = await tx.aIConversation.findUnique({
      where: { id: input.conversationId },
      select: { messages: { select: { id: true }, orderBy: { order: 'desc' }, take: 1 } },
    });
    const nextOrder = (conv?.messages[0] ? 1 : 0) + (await tx.aIMessage.count({ where: { conversationId: input.conversationId } }));
    const message = await tx.aIMessage.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        role: input.role,
        authorUserId: input.authorUserId ?? null,
        content: input.content,
        runId: input.runId ?? null,
        tokensInput: input.tokensInput,
        tokensOutput: input.tokensOutput,
        costUsd: input.costUsd,
        order: nextOrder,
      },
    });
    await tx.aIConversation.update({
      where: { id: input.conversationId },
      data: {
        ...(input.tokensInput
          ? { totalTokensInput: { increment: input.tokensInput } }
          : {}),
        ...(input.tokensOutput
          ? { totalTokensOutput: { increment: input.tokensOutput } }
          : {}),
        ...(input.costUsd
          ? { totalCostUsd: { increment: new Prisma.Decimal(input.costUsd) } }
          : {}),
        lastMessageAt: new Date(),
      },
    });
    return message;
  });
}

// ─── Read helpers (for the routes) ────────────────────────────────────────

export async function listRunsForEstimate(organizationId: string, estimateId: string) {
  return prisma.aIRun.findMany({
    where: { organizationId, estimateId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getRun(organizationId: string, id: string) {
  const run = await prisma.aIRun.findFirst({
    where: { id, organizationId },
    include: {
      messages: { orderBy: { order: 'asc' } },
    },
  });
  if (!run) throw new NotFoundError('AIRun', id);
  return run;
}

export async function getConversationForEstimate(
  organizationId: string,
  estimateId: string,
) {
  const conversation = await prisma.aIConversation.findFirst({
    where: { organizationId, estimateId },
  });
  if (!conversation) {
    return { conversation: null, messages: [], runs: [] };
  }
  const [messages, runs] = await Promise.all([
    prisma.aIMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { order: 'asc' },
    }),
    prisma.aIRun.findMany({
      where: { organizationId, estimateId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return { conversation, messages, runs };
}
