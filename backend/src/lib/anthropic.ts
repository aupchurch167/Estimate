/**
 * Anthropic SDK singleton.
 *
 * Production builds use the real client constructed from
 * env.ANTHROPIC_API_KEY. Unit tests inject a fake via
 * __setAnthropicClientForTesting() so the suite never reaches the
 * network.
 *
 * E2E tests (Phase 9.4) can't reach into the process to swap the client.
 * When `E2E_FAKE_ANTHROPIC=true` we pick the deterministic fake at boot
 * time so Playwright runs against a fixed-shape Anthropic response and
 * never touches the network.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

export type AnthropicLike = Pick<Anthropic, 'messages'>;

let override: AnthropicLike | undefined;
let client: Anthropic | undefined;

export function getAnthropicClient(): AnthropicLike {
  if (override) return override;
  if (process.env.E2E_FAKE_ANTHROPIC === 'true') {
    return e2eFakeClient();
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function __setAnthropicClientForTesting(fake: AnthropicLike | undefined): void {
  override = fake;
}

/**
 * Deterministic fake used by Playwright E2E tests. Returns a
 * structurally-correct tool_use response for both GENERATE_LINE_ITEMS
 * and ASK_FOLLOWUP based on the toolName the orchestrator forces.
 */
let cachedFake: AnthropicLike | undefined;
function e2eFakeClient(): AnthropicLike {
  if (cachedFake) return cachedFake;
  cachedFake = {
    messages: {
      async create(body: unknown) {
        const tools = (body as { tools?: { name: string }[] }).tools ?? [];
        const toolName = tools[0]?.name ?? 'submit_line_items';
        const input = makeFakeInput(toolName);
        return {
          id: 'msg_e2e',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-6',
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tool_e2e', name: toolName, input }],
          usage: { input_tokens: 50, output_tokens: 50 },
        };
      },
    } as unknown as AnthropicLike['messages'],
  };
  return cachedFake;
}

function makeFakeInput(toolName: string): Record<string, unknown> {
  if (toolName === 'submit_followup_response') {
    return {
      assistantMessage: 'Got it — adjusted the assumption.',
      suggestedAction: 'none',
      proposedActions: [],
    };
  }
  // submit_line_items default for GENERATE_LINE_ITEMS.
  return {
    scopeSummary: 'Demolition + frame + finish a single back-of-house wall.',
    assumptions: ['Wall is non-structural', '10ft ceiling height'],
    sections: [
      {
        name: 'Demolition',
        lineItems: [
          {
            description: 'Demo gypsum partition',
            quantity: 100,
            unitOfMeasure: 'SF',
            priceBookEntryCode: null,
            priceBookEntryDescription: null,
            aiConfidence: 0.9,
            aiAssumption: null,
          },
        ],
      },
    ],
  };
}
