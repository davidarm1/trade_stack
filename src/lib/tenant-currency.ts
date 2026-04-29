import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { normalizeCurrencyCode } from "@/lib/format-currency";

/** Per-request cached ISO 4217 code from `tenants.currency` (Settings → currency). */
export const getTenantCurrencyCode = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return normalizeCurrencyCode(null);

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.tenant_id) return normalizeCurrencyCode(null);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("currency")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  return normalizeCurrencyCode(tenant?.currency);
});
