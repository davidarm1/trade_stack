"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getWages(filters?: {
  userId?: string;
  periodFrom?: string;
  periodTo?: string;
}) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  let q = supabase
    .from("wages")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("period_date", { ascending: false });

  if (filters?.userId) {
    q = q.eq("user_id", filters.userId);
  }
  if (filters?.periodFrom) {
    q = q.gte("period_date", filters.periodFrom);
  }
  if (filters?.periodTo) {
    q = q.lte("period_date", filters.periodTo);
  }

  const { data, error } = await q;

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function approveWage(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("wages")
    .update({
      approval_status: "approved",
      approved_by_id: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/wages");
  return { data: row, error: null };
}

export async function rejectWage(id: string, reason: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("wages")
    .update({
      approval_status: "rejected",
      rejection_reason: reason,
      approved_by_id: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/wages");
  return { data: row, error: null };
}
