"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export async function getTimesheets(filters?: {
  userId?: string;
  from?: string;
  to?: string;
}) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  let q = supabase
    .from("timesheets")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("shift_date", { ascending: false });

  if (filters?.userId) {
    q = q.eq("user_id", filters.userId);
  }
  if (filters?.from) {
    q = q.gte("shift_date", filters.from);
  }
  if (filters?.to) {
    q = q.lte("shift_date", filters.to);
  }

  const { data, error } = await q;

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function approveTimesheet(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("timesheets")
    .update({
      status: "approved",
      approved_by_id: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/timesheets");
  return { data: row, error: null };
}
