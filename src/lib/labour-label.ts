import type { createClient } from "@/lib/supabase/server";

/** Stored per-tenant in the generic settings table — no schema change needed. */
export const LABOUR_LABEL_SETTING_KEY = "labour_label";
export const DEFAULT_LABOUR_LABEL = "Labour";

/** Falls back to "Labour" for tenants that haven't customised it (e.g. trades). */
export function resolveLabourLabel(raw: string | null | undefined): string {
  return raw?.trim() || DEFAULT_LABOUR_LABEL;
}

/**
 * Fetches just this one setting — lighter than loading the whole settings
 * table for pages that only need this label (job sheet/invoice rendering).
 */
export async function getLabourLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
): Promise<string> {
  const { data } = await supabase
    .from("settings")
    .select("field_value")
    .eq("tenant_id", tenantId)
    .eq("field_key", LABOUR_LABEL_SETTING_KEY)
    .maybeSingle();
  return resolveLabourLabel(data?.field_value);
}
