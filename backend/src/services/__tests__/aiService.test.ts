/**
 * Tests for the AI service infrastructure (Phase 3.1).
 *
 * Anthropic is mocked via __setAnthropicClientForTesting so no network
 * calls happen. Each test scenario sets the client to a fake whose
 * `messages.create` returns canned `tool_use` responses (or rejects).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import {
  __setAnthropicClientForTesting,
  type AnthropicLike,
} from '../../lib/anthropic.js';
import {
  MonthlyAiLimitError,
  appendMessage,
  checkCostCap,
  createRun,
  ensureConversation,
  getRun,
  listRunsForEstimate,
} from '../aiService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function makeContext() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `AI-${counter}-${RUN_ID}`,
    email: `ai-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'AI',
    lastName: 'Test',
  });
  orgIds.add(result.organization.id);
  const estimate = await prisma.estimate.create({
    data: {
      organizationId: result.organization.id,
      number: `AI-26-${String(counter).padStart(3, '0')}`,
      title: 'Sample',
      drafterId: result.user.id,
    },
  });
  return {
    organizationId: result.organization.id,
    userId: result.user.id,
    estimateId: estimate.id,
  };
}

const outputSchema = z.object({
  summary: z.string(),
  count: z.number().int(),
});

const toolInputSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    count: { type: 'integer' },
  },
  required: ['summary', 'count'],
};

// SDK's messages.create is heavily overloaded; we cast our fake through
// `unknown` so the test stays focused on shapes the service actually reads.
function fakeClient(create: (body: unknown) => Promise<unknown>): AnthropicLike {
  return { messages: { create } } as unknown as AnthropicLike;
}

const baseRunArgs = {
  runType: 'OTHER' as const,
  inputs: { test: true } as const,
  systemPrompt: 'You are a tester.',
  userMessage: 'Return summary + count.',
  toolName: 'submit_result',
  toolDescription: 'Submit the structured test result',
  toolInputSchema,
  outputSchema,
};

beforeEach(() => {
  __setAnthropicClientForTesting(undefined);
});

afterEach(() => {
  __setAnthropicClientForTesting(undefined);
});

afterAll(async () => {
  for (const orgId of orgIds) {
    await prisma.aIMessage.deleteMany({ where: { organizationId: orgId } });
    await prisma.aIRun.deleteMany({ where: { organizationId: orgId } });
    await prisma.aIConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.estimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('ensureConversation', () => {
  it('lazy-creates and is idempotent across the same estimate', async () => {
    const ctx = await makeContext();
    const a = await ensureConversation(ctx.organizationId, ctx.estimateId);
    const b = await ensureConversation(ctx.organizationId, ctx.estimateId);
    expect(a.id).toBe(b.id);
  });
});

describe('checkCostCap', () => {
  it('returns blocked=false when no cap is set', async () => {
    const ctx = await makeContext();
    await prisma.orgSettings.update({
      where: { organizationId: ctx.organizationId },
      data: { monthlyAiCostCapUsd: null },
    });
    const cap = await checkCostCap(ctx.organizationId);
    expect(cap.blocked).toBe(false);
    expect(cap.capUsd).toBeNull();
  });

  it('blocks when month-to-date cost ≥ cap', async () => {
    const ctx = await makeContext();
    await prisma.orgSettings.update({
      where: { organizationId: ctx.organizationId },
      data: { monthlyAiCostCapUsd: '5' },
    });
    // Seed a SUCCEEDED run that consumed $5.50.
    const conversation = await ensureConversation(ctx.organizationId, ctx.estimateId);
    await prisma.aIRun.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: conversation.id,
        estimateId: ctx.estimateId,
        triggeredById: ctx.userId,
        runType: 'OTHER',
        status: 'SUCCEEDED',
        inputs: {},
        modelVersion: 'claude-sonnet-4-6',
        costUsd: '5.5',
      },
    });
    const cap = await checkCostCap(ctx.organizationId);
    expect(cap.blocked).toBe(true);
    expect(cap.monthToDateUsd).toBeCloseTo(5.5, 2);
  });
});

describe('createRun', () => {
  it('returns a SUCCEEDED run with validated outputs and bumps conversation aggregates', async () => {
    const ctx = await makeContext();
    __setAnthropicClientForTesting(
      fakeClient(async () => ({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'submit_result',
            input: { summary: 'looks good', count: 3 },
          },
        ],
        usage: { input_tokens: 1000, output_tokens: 200 },
      })),
    );
    const result = await createRun({
      ...baseRunArgs,
      organizationId: ctx.organizationId,
      estimateId: ctx.estimateId,
      userId: ctx.userId,
    });
    expect(result.run.status).toBe('SUCCEEDED');
    expect(result.output).toEqual({ summary: 'looks good', count: 3 });
    expect(result.run.tokensInput).toBe(1000);
    expect(result.run.tokensOutput).toBe(200);
    expect(result.run.costUsd).not.toBeNull();

    const conv = await prisma.aIConversation.findUnique({
      where: { estimateId: ctx.estimateId },
    });
    expect(conv?.totalTokensInput).toBe(1000);
    expect(conv?.totalTokensOutput).toBe(200);
  });

  it('retries once on schema mismatch and succeeds on the second attempt', async () => {
    const ctx = await makeContext();
    let calls = 0;
    __setAnthropicClientForTesting(
      fakeClient(async () => {
        calls += 1;
        if (calls === 1) {
          return {
            id: 'msg_a',
            type: 'message',
            role: 'assistant',
            model: 'x',
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 't',
                name: 'submit_result',
                input: { summary: 'missing count' },
              },
            ],
            usage: { input_tokens: 50, output_tokens: 25 },
          };
        }
        return {
          id: 'msg_b',
          type: 'message',
          role: 'assistant',
          model: 'x',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 't',
              name: 'submit_result',
              input: { summary: 'fixed', count: 7 },
            },
          ],
          usage: { input_tokens: 60, output_tokens: 30 },
        };
      }),
    );
    const result = await createRun({
      ...baseRunArgs,
      organizationId: ctx.organizationId,
      estimateId: ctx.estimateId,
      userId: ctx.userId,
    });
    expect(calls).toBe(2);
    expect(result.run.status).toBe('SUCCEEDED');
    // Tokens should accumulate across both attempts.
    expect(result.run.tokensInput).toBe(110);
    expect(result.run.tokensOutput).toBe(55);
  });

  it('marks run FAILED after second failure with the error message', async () => {
    const ctx = await makeContext();
    __setAnthropicClientForTesting(
      fakeClient(async () => ({
        id: 'msg_x',
        type: 'message',
        role: 'assistant',
        model: 'x',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 't',
            name: 'submit_result',
            input: { summary: 'still bad' },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })),
    );
    await expect(
      createRun({
        ...baseRunArgs,
        organizationId: ctx.organizationId,
        estimateId: ctx.estimateId,
        userId: ctx.userId,
      }),
    ).rejects.toThrow();

    const fresh = await prisma.aIRun.findFirst({
      where: { estimateId: ctx.estimateId },
      orderBy: { createdAt: 'desc' },
    });
    expect(fresh?.status).toBe('FAILED');
    expect(fresh?.errorMessage).toMatch(/schema/i);
  });

  it('cancels the run with monthly_ai_limit_reached when over cap', async () => {
    const ctx = await makeContext();
    await prisma.orgSettings.update({
      where: { organizationId: ctx.organizationId },
      data: { monthlyAiCostCapUsd: '0.01' },
    });
    const conversation = await ensureConversation(ctx.organizationId, ctx.estimateId);
    await prisma.aIRun.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: conversation.id,
        estimateId: ctx.estimateId,
        triggeredById: ctx.userId,
        runType: 'OTHER',
        status: 'SUCCEEDED',
        inputs: {},
        modelVersion: 'claude-sonnet-4-6',
        costUsd: '0.5',
      },
    });
    let createCalls = 0;
    __setAnthropicClientForTesting(
      fakeClient(async () => {
        createCalls += 1;
        return {} as never;
      }),
    );
    await expect(
      createRun({
        ...baseRunArgs,
        organizationId: ctx.organizationId,
        estimateId: ctx.estimateId,
        userId: ctx.userId,
      }),
    ).rejects.toBeInstanceOf(MonthlyAiLimitError);
    expect(createCalls).toBe(0);

    const cancelled = await prisma.aIRun.findFirst({
      where: { estimateId: ctx.estimateId, status: 'CANCELLED' },
    });
    expect(cancelled).toBeTruthy();
    expect(cancelled?.errorMessage).toBe('monthly_ai_limit_reached');
  });

  it('uses the light model when modelTier=light', async () => {
    const ctx = await makeContext();
    let modelSeen = '';
    __setAnthropicClientForTesting(
      fakeClient(async (req) => {
        modelSeen = (req as { model?: string }).model ?? '';
        return {
          id: 'msg',
          type: 'message',
          role: 'assistant',
          model: modelSeen,
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 't',
              name: 'submit_result',
              input: { summary: 'ok', count: 1 },
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      }),
    );
    await createRun({
      ...baseRunArgs,
      modelTier: 'light',
      organizationId: ctx.organizationId,
      estimateId: ctx.estimateId,
      userId: ctx.userId,
    });
    expect(modelSeen).toContain('haiku');
  });
});

describe('appendMessage', () => {
  it('writes a message and updates conversation aggregates', async () => {
    const ctx = await makeContext();
    const conv = await ensureConversation(ctx.organizationId, ctx.estimateId);
    const msg = await appendMessage({
      organizationId: ctx.organizationId,
      conversationId: conv.id,
      role: 'USER',
      content: 'Hi there',
      authorUserId: ctx.userId,
      tokensInput: 5,
      tokensOutput: 0,
      costUsd: '0.000050',
    });
    expect(msg.order).toBe(0);

    const fresh = await prisma.aIConversation.findUnique({ where: { id: conv.id } });
    expect(fresh?.totalTokensInput).toBe(5);
    expect(fresh?.lastMessageAt).not.toBeNull();
  });
});

describe('listRunsForEstimate + getRun', () => {
  it('lists runs newest-first and returns a single run with messages', async () => {
    const ctx = await makeContext();
    const conv = await ensureConversation(ctx.organizationId, ctx.estimateId);
    const a = await prisma.aIRun.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: conv.id,
        estimateId: ctx.estimateId,
        triggeredById: ctx.userId,
        runType: 'OTHER',
        status: 'SUCCEEDED',
        inputs: {},
        modelVersion: 'x',
      },
    });
    const b = await prisma.aIRun.create({
      data: {
        organizationId: ctx.organizationId,
        conversationId: conv.id,
        estimateId: ctx.estimateId,
        triggeredById: ctx.userId,
        runType: 'OTHER',
        status: 'SUCCEEDED',
        inputs: {},
        modelVersion: 'x',
      },
    });
    const list = await listRunsForEstimate(ctx.organizationId, ctx.estimateId);
    expect(list[0]?.id).toBe(b.id);
    expect(list[1]?.id).toBe(a.id);

    const single = await getRun(ctx.organizationId, b.id);
    expect(single.id).toBe(b.id);
    expect(Array.isArray(single.messages)).toBe(true);
  });
});
