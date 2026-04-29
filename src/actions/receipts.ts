"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Receipt } from "@/types/database";

type ReceiptInsert = Partial<
  Omit<Receipt, "id" | "tenant_id" | "created_at" | "updated_at">
>;

function isPaid(status: string | null | undefined): boolean {
  return (status || "").trim().toLowerCase() === "paid";
}

function isUnpaid(status: string | null | undefined): boolean {
  return (status || "").trim().toLowerCase() === "unpaid";
}

function dateOnlyUtc(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export async function createReceipt(data: ReceiptInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

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
  const supabase = await createClient();

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
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("tenant_id", ctx.tenantId);

  if (error) return { data: null, error: error.message };
  const sorted = [...(data ?? [])].sort((a, b) => {
    const aUnpaid = isUnpaid(a.payment_status);
    const bUnpaid = isUnpaid(b.payment_status);
    if (aUnpaid !== bUnpaid) return aUnpaid ? -1 : 1;

    const aPaid = isPaid(a.payment_status);
    const bPaid = isPaid(b.payment_status);
    if (aPaid !== bPaid) return aPaid ? 1 : -1;

    const aDue = dateOnlyUtc(a.due_date);
    const bDue = dateOnlyUtc(b.due_date);
    if (aDue != null && bDue != null && aDue !== bDue) return aDue - bDue;
    if (aDue == null && bDue != null) return 1;
    if (aDue != null && bDue == null) return -1;

    const aCreated = dateOnlyUtc(a.created_at) ?? 0;
    const bCreated = dateOnlyUtc(b.created_at) ?? 0;
    return bCreated - aCreated;
  });

  return { data: sorted, error: null };
}

/** Invalidate the outgoings page cache (e.g. after upload). Call from client after a successful save. */
export async function revalidateReceiptsPage() {
  revalidatePath("/receipts");
}
