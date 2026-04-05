"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Client } from "@/types/database";

type ClientInsert = Partial<
  Omit<Client, "id" | "tenant_id" | "created_at" | "updated_at" | "deleted_at">
>;

export async function createClient(data: ClientInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("clients")
    .insert({ ...data, tenant_id: ctx.tenantId })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/clients");
  return { data: row, error: null };
}

export async function updateClient(id: string, data: ClientInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("clients")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { data: row, error: null };
}

export async function getClients() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createSupabaseServerClient();

  const { data: clients, error } = await supabase
    .from("clients")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null)
    .order("company_name", { ascending: true });

  if (error) return { data: null, error: error.message };

  const { data: jobCounts } = await supabase
    .from("jobs")
    .select("client_id")
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null)
    .not("status", "eq", "completed");

  const counts: Record<string, number> = {};
  for (const row of jobCounts ?? []) {
    if (row.client_id) {
      counts[row.client_id] = (counts[row.client_id] ?? 0) + 1;
    }
  }

  const enriched = (clients ?? []).map((c) => ({
    ...c,
    active_jobs_count: counts[c.id] ?? 0,
  }));

  return { data: enriched, error: null };
}

export async function getClient(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
