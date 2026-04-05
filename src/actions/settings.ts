"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Tenant } from "@/types/database";

type TenantUpdate = Partial<
  Omit<Tenant, "id" | "created_at" | "updated_at" | "slug">
>;

export async function getSettings() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", ctx.tenantId)
    .maybeSingle();

  if (tErr) return { data: null, error: tErr.message };

  const { data: rows, error: sErr } = await supabase
    .from("settings")
    .select("*")
    .eq("tenant_id", ctx.tenantId);

  if (sErr) return { data: null, error: sErr.message };

  const keyValues: Record<string, string> = {};
  for (const r of rows ?? []) {
    if (r.field_key && r.field_value != null) {
      keyValues[r.field_key] = r.field_value;
    }
  }

  return { data: { tenant, keyValues }, error: null };
}

export async function updateSettings(data: TenantUpdate) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: row, error } = await supabase
    .from("tenants")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { data: row, error: null };
}
