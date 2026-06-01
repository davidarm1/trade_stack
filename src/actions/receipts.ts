"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Receipt } from "@/types/database";

export type EnrichedReceipt = Receipt & {
  uploaded_by_name: string | null;
  job_number: number | null;
  job_title: string | null;
};

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

export async function getReceipts(): Promise<{ data: EnrichedReceipt[] | null; error: string | null }> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .eq("tenant_id", ctx.tenantId);

  if (error) return { data: null, error: error.message };
  const rows = data ?? [];

  const sorted = [...rows].sort((a, b) => {
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

  const uploaderIds = [...new Set(rows.map((r) => r.uploaded_by_id).filter(Boolean))] as string[];
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))] as string[];

  const [uploadersRes, jobsRes] = await Promise.all([
    uploaderIds.length > 0
      ? supabase.from("users").select("id, name").in("id", uploaderIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[], error: null }),
    jobIds.length > 0
      ? supabase.from("jobs").select("id, job_number, title").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; job_number: number | null; title: string | null }[], error: null }),
  ]);

  const uploaderMap = new Map((uploadersRes.data ?? []).map((u) => [u.id, u.name]));
  const jobMap = new Map((jobsRes.data ?? []).map((j) => [j.id, { job_number: j.job_number, title: j.title }]));

  const enriched: EnrichedReceipt[] = sorted.map((r) => ({
    ...r,
    uploaded_by_name: r.uploaded_by_id ? (uploaderMap.get(r.uploaded_by_id) ?? null) : null,
    job_number: r.job_id ? (jobMap.get(r.job_id)?.job_number ?? null) : null,
    job_title: r.job_id ? (jobMap.get(r.job_id)?.title ?? null) : null,
  }));

  return { data: enriched, error: null };
}

/** Invalidate the outgoings page cache (e.g. after upload). Call from client after a successful save. */
export async function revalidateReceiptsPage() {
  revalidatePath("/receipts");
}
