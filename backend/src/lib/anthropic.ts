/**
 * Anthropic SDK singleton.
 *
 * Production builds use the real client constructed from
 * env.ANTHROPIC_API_KEY. Tests inject a fake via
 * __setAnthropicClientForTesting() so the unit suite never reaches the
 * network.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';

export type AnthropicLike = Pick<Anthropic, 'messages'>;

let override: AnthropicLike | undefined;
let client: Anthropic | undefined;

export function getAnthropicClient(): AnthropicLike {
  if (override) return override;
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function __setAnthropicClientForTesting(fake: AnthropicLike | undefined): void {
  override = fake;
}
