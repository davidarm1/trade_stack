export type AiUsageGroupKey = "quote" | "receipt" | "outgoing";

export type AiUsageGroupConfig = {
  key: AiUsageGroupKey;
  label: string;
  featureNames: string[];
  monthlySoftCapPence: number;
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
    monthlySoftCapPence: 5000,
  },
  {
    key: "receipt",
    label: "Receipt",
    featureNames: ["receipt_scan"],
    monthlySoftCapPence: 2500,
  },
  {
    key: "outgoing",
    label: "Outgoing",
    featureNames: ["job_message_parse"],
    monthlySoftCapPence: 2500,
  },
] as const;

export type AiUsageGroupSummary = {
  calls: number;
  costPence: number;
  monthlySoftCapPence: number;
};

export type AiUsageSummary = Record<AiUsageGroupKey, AiUsageGroupSummary>;

export function emptyAiUsageSummary(): AiUsageSummary {
  return Object.fromEntries(
    AI_USAGE_GROUPS.map((group) => [group.key, { calls: 0, costPence: 0, monthlySoftCapPence: group.monthlySoftCapPence }]),
  ) as AiUsageSummary;
}

export function aiUsageGroupForFeature(feature: string): AiUsageGroupConfig | null {
  const raw = String(feature ?? "").trim();
  if (!raw) return null;
  return AI_USAGE_GROUPS.find((group) => group.featureNames.includes(raw)) ?? null;
}

export function summarizeAiUsageRows(
  rows: Array<{ feature: string; cost_pence: number | null }>,
): AiUsageSummary {
  const summary = emptyAiUsageSummary();
  for (const row of rows) {
    const group = aiUsageGroupForFeature(row.feature);
    if (!group) continue;
    const costPence = typeof row.cost_pence === "number" ? row.cost_pence : Number(row.cost_pence ?? 0);
    summary[group.key].calls += 1;
    summary[group.key].costPence += Number.isFinite(costPence) ? costPence : 0;
  }
  return summary;
}
