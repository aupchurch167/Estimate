/**
 * Integration tests for the ASK_FOLLOWUP pipeline.
 *
 * Anthropic is faked via __setAnthropicClientForTesting; the rest hits
 * the real database so we exercise the actual conversation persistence
 * (USER message stored before the AI call, ASSISTANT message stored
 * after, runId linked).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { signup as serviceSignup } from '../../services/authService.js';
import {
  __setAnthropicClientForTesting,
  type AnthropicLike,
} from '../../lib/anthropic.js';
import { ask } from '../askFollowupService.js';

const RUN_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let counter = 0;
const orgIds = new Set<string>();

async function setup() {
  counter += 1;
  const result = await serviceSignup({
    companyName: `Ask-${counter}-${RUN_ID}`,
    email: `ask-${counter}-${RUN_ID}@example.test`,
    password: 'OriginalPass1!',
    firstName: 'Ask',
    lastName: 'Test',
  });
  orgIds.add(result.organization.id);

  const estimate = await prisma.estimate.create({
    data: {
      organizationId: result.organization.id,
      number: `ASK-26-${String(counter).padStart(3, '0')}`,
      title: 'Ask Suite TI',
      drafterId: result.user.id,
    },
  });

  return {
    organizationId: result.organization.id,
    userId: result.user.id,
    estimateId: estimate.id,
  };
}

function fakeClient(create: (body: unknown) => Promise<unknown>): AnthropicLike {
  return { messages: { create } } as unknown as AnthropicLike;
}

const baseUsage = { input_tokens: 50, output_tokens: 30 };

function makeAnthropicResponse(toolInput: unknown) {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'tool',
        name: 'submit_followup_response',
        input: toolInput,
      },
    ],
    usage: baseUsage,
  };
}

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
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.orgSettings.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('askFollowupService.ask', () => {
  it('appends a USER message, runs Claude, and appends the ASSISTANT reply tied to the run', async () => {
    const ctx = await setup();
    __setAnthropicClientForTesting(
      fakeClient(async () =>
        makeAnthropicResponse({
          assistantMessage: 'The demo line covers gypsum only — framing is separate.',
          suggestedAction: 'none',
          proposedActions: [],
        }),
      ),
    );

    const result = await ask(
      ctx.organizationId,
      ctx.userId,
      ctx.estimateId,
      'Does the demo line cover wall framing too?',
    );

    expect(result.assistantMessage).toMatch(/gypsum/);
    expect(result.suggestedAction).toBe('none');
    expect(result.runId).toBeTruthy();

    const messages = await prisma.aIMessage.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { order: 'asc' },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('USER');
    expect(messages[0]?.content).toMatch(/wall framing/);
    expect(messages[0]?.authorUserId).toBe(ctx.userId);
    expect(messages[1]?.role).toBe('ASSISTANT');
    expect(messages[1]?.runId).toBe(result.runId);

    const run = await prisma.aIRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.runType).toBe('ASK_FOLLOWUP');
    expect(run.status).toBe('SUCCEEDED');
    expect(run.modelVersion).toMatch(/haiku/);
  });

  it('persists the USER message even when the AI call fails', async () => {
    const ctx = await setup();
    __setAnthropicClientForTesting(
      fakeClient(async () => {
        throw new Error('boom');
      }),
    );

    await expect(
      ask(ctx.organizationId, ctx.userId, ctx.estimateId, 'why?'),
    ).rejects.toThrow();

    const messages = await prisma.aIMessage.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { order: 'asc' },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('USER');
    expect(messages[0]?.content).toBe('why?');
  });

  it('rejects when the estimate is locked', async () => {
    const ctx = await setup();
    await prisma.estimate.update({
      where: { id: ctx.estimateId },
      data: { status: 'SENT', sentAt: new Date() },
    });
    await expect(
      ask(ctx.organizationId, ctx.userId, ctx.estimateId, 'hi'),
    ).rejects.toThrow(/locked|SENT|cannot/i);

    const count = await prisma.aIMessage.count({
      where: { organizationId: ctx.organizationId },
    });
    expect(count).toBe(0);
  });

  it('rejects empty / whitespace-only userText with a validation error', async () => {
    const ctx = await setup();
    await expect(
      ask(ctx.organizationId, ctx.userId, ctx.estimateId, '   '),
    ).rejects.toThrow(/empty/i);

    const count = await prisma.aIMessage.count({
      where: { organizationId: ctx.organizationId },
    });
    expect(count).toBe(0);
  });

  it('passes the estimator transcript + suggestedAction back through', async () => {
    const ctx = await setup();
    let captured: unknown = null;
    __setAnthropicClientForTesting(
      fakeClient(async (body) => {
        captured = body;
        return makeAnthropicResponse({
          assistantMessage: 'Yes — swapping ceiling tile changes the finish line. Re-draft it.',
          suggestedAction: 'regenerate_line_items',
          proposedActions: [],
        });
      }),
    );

    const result = await ask(
      ctx.organizationId,
      ctx.userId,
      ctx.estimateId,
      'What if we use 2x2 ceiling tile instead of 2x4?',
    );

    expect(result.suggestedAction).toBe('regenerate_line_items');
    const body = captured as { messages: { content: string }[] };
    expect(body.messages[0]?.content).toMatch(/ceiling tile/i);
    expect(body.messages[0]?.content).toMatch(/New question from the estimator/);
  });
});
