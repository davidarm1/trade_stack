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
  const supabase = await createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("clients")
    .insert({ ...data, tenant_id: ctx.tenantId })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/clients");
  revalidatePath("/jobs");
  return { data: row, error: null };
}

export async function searchClients(query: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createSupabaseServerClient();

  const raw = query.trim();
  if (raw.length < 2) return { data: [] as Client[], error: null };

  const safe = raw.replace(/[%_]/g, "");
  if (safe.length < 2) return { data: [] as Client[], error: null };

  const pattern = `%${safe}%`;
  const base = () =>
    supabase
      .from("clients")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .is("deleted_at", null);

  const [byCompany, byContact, byEmail] = await Promise.all([
    base().ilike("company_name", pattern).order("company_name", { ascending: true }).limit(20),
    base().ilike("contact_name", pattern).order("company_name", { ascending: true }).limit(20),
    base().ilike("contact_email", pattern).order("company_name", { ascending: true }).limit(20),
  ]);

  const err =
    byCompany.error ?? byContact.error ?? byEmail.error;
  if (err) return { data: null, error: err.message };

  const merged = new Map<string, Client>();
  for (const row of [
    ...(byCompany.data ?? []),
    ...(byContact.data ?? []),
    ...(byEmail.data ?? []),
  ]) {
    merged.set(row.id, row as Client);
  }

  const list = Array.from(merged.values()).sort((a, b) =>
    a.company_name.localeCompare(b.company_name, undefined, { sensitivity: "base" }),
  );
  return { data: list.slice(0, 20), error: null };
}

export async function updateClient(id: string, data: ClientInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createSupabaseServerClient();

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
  const supabase = await createSupabaseServerClient();

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
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
