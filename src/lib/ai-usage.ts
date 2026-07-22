import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAiCostUsd,
  normalizeProviderUsage,
  type ProviderUsageLike,
} from "@/lib/ai-usage-pricing";

export type RecordAiUsageArgs = {
  supabase: SupabaseClient;
  tenantId: string | null | undefined;
  feature: string;
  model: string;
  usage: ProviderUsageLike;
  /** Log label for failures, e.g. "[scan-receipt]". */
  logLabel?: string;
};

export type RecordAiUsageResult =
  | { ok: true; costUsd: number | null }
  | { ok: false; error: string; rejected?: "missing_tenant" };

/**
 * Insert one tenant-scoped ai_usage row with computed cost_usd.
 *
 * Metering failures are logged and returned — they must not leak cross-tenant data.
 * Call sites decide whether to fail the feature (parse-message) or continue (receipt scan).
 * Missing tenant context is always rejected without inserting.
 */
export async function recordAiUsage(args: RecordAiUsageArgs): Promise<RecordAiUsageResult> {
  const tenantId = typeof args.tenantId === "string" ? args.tenantId.trim() : "";
  const feature = String(args.feature ?? "").trim();
  const model = String(args.model ?? "").trim();
  const label = args.logLabel ?? "[ai-usage]";

  if (!tenantId) {
    console.error(`${label} refused ai_usage insert: missing tenant context`);
    return { ok: false, error: "Missing tenant context for AI usage", rejected: "missing_tenant" };
  }
  if (!feature) {
    console.error(`${label} refused ai_usage insert: missing feature`);
    return { ok: false, error: "Missing AI feature name" };
  }

  const tokens = normalizeProviderUsage(args.usage);
  const costUsd = computeAiCostUsd({
    model,
    promptTokens: tokens.promptTokens,
    completionTokens: tokens.completionTokens,
  });

  const { error } = await args.supabase.from("ai_usage").insert({
    tenant_id: tenantId,
    feature,
    model: model || null,
    prompt_tokens: tokens.promptTokens,
    completion_tokens: tokens.completionTokens,
    total_tokens: tokens.totalTokens,
    cost_usd: costUsd,
  });

  if (error) {
    console.error(`${label} ai_usage insert failed:`, error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, costUsd };
}
