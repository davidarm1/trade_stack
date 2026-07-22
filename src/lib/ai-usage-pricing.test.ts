import { describe, expect, it } from "vitest";
import {
  AI_USAGE_GROUPS,
  aiUsageGroupForFeature,
  aiUsageMonthTotalUsd,
  summarizeAiUsageRows,
  sumAiUsageCostUsd,
} from "./ai-usage-metrics";
import {
  computeAiCostUsd,
  MODEL_PRICES_USD,
  normalizeProviderUsage,
} from "./ai-usage-pricing";

describe("normalizeProviderUsage", () => {
  it("returns nulls for null usage", () => {
    expect(normalizeProviderUsage(null)).toEqual({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });
  });

  it("maps chat completion usage fields", () => {
    expect(
      normalizeProviderUsage({
        prompt_tokens: 100,
        completion_tokens: 40,
        total_tokens: 140,
      }),
    ).toEqual({
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
    });
  });

  it("maps responses API input/output tokens", () => {
    expect(
      normalizeProviderUsage({
        input_tokens: 10,
        output_tokens: 5,
      }),
    ).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });
});

describe("computeAiCostUsd", () => {
  it("prices gpt-4o-mini from the versioned map", () => {
    const prices = MODEL_PRICES_USD["gpt-4o-mini"];
    const cost = computeAiCostUsd({
      model: "gpt-4o-mini",
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    expect(cost).toBe(
      Math.round((prices.inputPerMillionUsd + prices.outputPerMillionUsd) * 1_000_000) /
        1_000_000,
    );
  });

  it("returns null for unknown models", () => {
    expect(
      computeAiCostUsd({
        model: "mystery-model",
        promptTokens: 100,
        completionTokens: 10,
      }),
    ).toBeNull();
  });

  it("returns null when both token sides are missing", () => {
    expect(
      computeAiCostUsd({
        model: "gpt-4o-mini",
        promptTokens: null,
        completionTokens: null,
      }),
    ).toBeNull();
  });
});

describe("ai usage grouping and aggregation", () => {
  it("labels job_message_parse as Job message, not Outgoing", () => {
    const group = aiUsageGroupForFeature("job_message_parse");
    expect(group?.key).toBe("job");
    expect(group?.label).toBe("Job message");
    expect(AI_USAGE_GROUPS.some((g) => g.label === "Outgoing")).toBe(false);
  });

  it("aggregates cost_usd by feature group", () => {
    const summary = summarizeAiUsageRows([
      { feature: "quote_price", cost_usd: 0.01 },
      { feature: "receipt_scan", cost_usd: 0.02 },
      { feature: "job_message_parse", cost_usd: 0.03 },
      { feature: "unknown", cost_usd: 9 },
    ]);
    expect(summary.quote.calls).toBe(1);
    expect(summary.quote.costUsd).toBeCloseTo(0.01);
    expect(summary.receipt.costUsd).toBeCloseTo(0.02);
    expect(summary.job.costUsd).toBeCloseTo(0.03);
    expect(aiUsageMonthTotalUsd(summary)).toBeCloseTo(0.06);
    expect(
      sumAiUsageCostUsd([
        { feature: "a", cost_usd: 1.5 },
        { feature: "b", cost_usd: null },
      ]),
    ).toBeCloseTo(1.5);
  });
});
