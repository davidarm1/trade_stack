export type AiUsageGroupKey = "quote" | "receipt" | "job";

export type AiUsageGroupConfig = {
  key: AiUsageGroupKey;
  label: string;
  featureNames: string[];
  /** Soft monthly budget in USD (OpenAI bill currency). */
  monthlySoftCapUsd: number;
};

/**
 * Canonical AI cost / cap configuration for the platform-admin usage page.
 * Keep this as the single source of truth so the metering and reporting layers
 * do not drift.
 */
export const AI_USAGE_GROUPS: ReadonlyArray<AiUsageGroupConfig> = [
  {
    key: "quote",
    label: "Quote",
    featureNames: ["quote_price", "quote_request_parse", "mobile_quote_request"],
    monthlySoftCapUsd: 50,
  },
  {
    key: "receipt",
    label: "Receipt",
    featureNames: ["receipt_scan"],
    monthlySoftCapUsd: 25,
  },
  {
    key: "job",
    label: "Job message",
    featureNames: ["job_message_parse"],
    monthlySoftCapUsd: 25,
  },
] as const;

export type AiUsageGroupSummary = {
  calls: number;
  costUsd: number;
  monthlySoftCapUsd: number;
};

export type AiUsageSummary = Record<AiUsageGroupKey, AiUsageGroupSummary>;

export type AiUsageCostRow = {
  feature: string;
  cost_usd: number | null;
};

export function emptyAiUsageSummary(): AiUsageSummary {
  return Object.fromEntries(
    AI_USAGE_GROUPS.map((group) => [
      group.key,
      { calls: 0, costUsd: 0, monthlySoftCapUsd: group.monthlySoftCapUsd },
    ]),
  ) as AiUsageSummary;
}

export function aiUsageGroupForFeature(feature: string): AiUsageGroupConfig | null {
  const raw = String(feature ?? "").trim();
  if (!raw) return null;
  return AI_USAGE_GROUPS.find((group) => group.featureNames.includes(raw)) ?? null;
}

export function summarizeAiUsageRows(rows: AiUsageCostRow[]): AiUsageSummary {
  const summary = emptyAiUsageSummary();
  for (const row of rows) {
    const group = aiUsageGroupForFeature(row.feature);
    if (!group) continue;
    const costUsd =
      typeof row.cost_usd === "number" ? row.cost_usd : Number(row.cost_usd ?? 0);
    summary[group.key].calls += 1;
    summary[group.key].costUsd += Number.isFinite(costUsd) ? costUsd : 0;
  }
  return summary;
}

export function aiUsageMonthTotalUsd(summary: AiUsageSummary): number {
  return AI_USAGE_GROUPS.reduce((sum, group) => sum + summary[group.key].costUsd, 0);
}

export function sumAiUsageCostUsd(rows: AiUsageCostRow[]): number {
  return rows.reduce((sum, row) => {
    const cost =
      typeof row.cost_usd === "number" ? row.cost_usd : Number(row.cost_usd ?? 0);
    return sum + (Number.isFinite(cost) ? cost : 0);
  }, 0);
}
