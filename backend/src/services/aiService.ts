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
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { getAnthropicClient } from '../lib/anthropic.js';
import { tokenCostDecimal } from '../lib/costing.js';

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
  throw lastError ?? new Error('Unknown AI failure');
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
