/**
 * Token → USD pricing per Claude model.
 *
 * Numbers are dollars per 1M tokens (input / output) and are used for the
 * monthly AI cost cap accounting only — they do not need to be Anthropic's
 * canonical billing rates. Update when prices change; for unknown models we
 * fall back to the Sonnet tier so we don't undercount.
 */

export interface ModelRates {
  inputPerMillion: number;
  outputPerMillion: number;
}

const RATES: Record<string, ModelRates> = {
  // Claude 4.6 / 4.5 family.
  'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4-5-20251001': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  'claude-haiku-4-5': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  // Earlier 3.x versions, kept for backwards-compat with older prompts.
  'claude-3-5-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-5-haiku': { inputPerMillion: 1, outputPerMillion: 5 },
};

const FALLBACK: ModelRates = { inputPerMillion: 3, outputPerMillion: 15 };

export function ratesFor(model: string): ModelRates {
  return RATES[model] ?? FALLBACK;
}

export function tokenCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rates = ratesFor(model);
  const inputUsd = (inputTokens / 1_000_000) * rates.inputPerMillion;
  const outputUsd = (outputTokens / 1_000_000) * rates.outputPerMillion;
  return inputUsd + outputUsd;
}

/**
 * Format as a string compatible with Prisma Decimal columns. We keep 6
 * decimal places since runs can be sub-cent.
 */
export function tokenCostDecimal(
  model: string,
  inputTokens: number,
  outputTokens: number,
): string {
  return tokenCostUsd(model, inputTokens, outputTokens).toFixed(6);
}
