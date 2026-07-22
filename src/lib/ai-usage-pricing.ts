/**
 * Versioned OpenAI model prices (USD per 1M tokens).
 * Bump MODEL_PRICE_VERSION when rates change so audits know which map applied.
 */
export const MODEL_PRICE_VERSION = "2026-07-21";

export type ModelTokenPrices = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

/** Canonical prices used by recordAiUsage. Unknown models yield null cost. */
export const MODEL_PRICES_USD: Readonly<Record<string, ModelTokenPrices>> = {
  "gpt-4o-mini": {
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
  },
  "gpt-4o": {
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10,
  },
};

export type ProviderUsageLike = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
} | null | undefined;

export type NormalizedTokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export function normalizeProviderUsage(usage: ProviderUsageLike): NormalizedTokenUsage {
  if (!usage || typeof usage !== "object") {
    return { promptTokens: null, completionTokens: null, totalTokens: null };
  }

  const promptRaw = usage.prompt_tokens ?? usage.input_tokens ?? null;
  const completionRaw = usage.completion_tokens ?? usage.output_tokens ?? null;
  const totalRaw = usage.total_tokens ?? null;

  const promptTokens = toNonNegIntOrNull(promptRaw);
  const completionTokens = toNonNegIntOrNull(completionRaw);
  let totalTokens = toNonNegIntOrNull(totalRaw);
  if (totalTokens == null && promptTokens != null && completionTokens != null) {
    totalTokens = promptTokens + completionTokens;
  }

  return { promptTokens, completionTokens, totalTokens };
}

function toNonNegIntOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/**
 * Compute USD cost from token counts and the versioned price map.
 * Returns null when the model is unknown or both token sides are missing.
 */
export function computeAiCostUsd(args: {
  model: string | null | undefined;
  promptTokens: number | null;
  completionTokens: number | null;
}): number | null {
  const model = String(args.model ?? "").trim();
  if (!model) return null;
  const prices = MODEL_PRICES_USD[model];
  if (!prices) return null;

  const prompt = args.promptTokens ?? 0;
  const completion = args.completionTokens ?? 0;
  if (args.promptTokens == null && args.completionTokens == null) {
    return null;
  }

  const cost =
    (prompt / 1_000_000) * prices.inputPerMillionUsd +
    (completion / 1_000_000) * prices.outputPerMillionUsd;

  // Match ai_usage.cost_usd numeric(10, 6)
  return Math.round(cost * 1_000_000) / 1_000_000;
}
