"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Receipt } from "@/types/database";

type ReceiptInsert = Partial<
  Omit<Receipt, "id" | "tenant_id" | "created_at" | "updated_at">
>;

export async function createReceipt(data: ReceiptInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: row, error } = await supabase
    .from("receipts")
    .insert({
      ...data,
      tenant_id: ctx.tenantId,
      uploaded_by_id: ctx.userId,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/receipts");
  return { data: row, error: null };
}

export async function updateReceipt(id: string, data: ReceiptInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: row, error } = await supabase
    .from("receipts")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/receipts");
  return { data: row, error: null };
}

export async function getReceipts() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
