"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Quote } from "@/types/database";

type QuoteInsert = Partial<
  Omit<Quote, "id" | "tenant_id" | "created_at" | "updated_at" | "deleted_at">
>;

export async function createQuote(data: QuoteInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: row, error } = await supabase
    .from("quotes")
    .insert({
      ...data,
      tenant_id: ctx.tenantId,
      created_by_id: ctx.userId,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/quotes");
  return { data: row, error: null };
}

export async function convertQuoteToJob(quoteId: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (qErr) return { data: null, error: qErr.message };
  if (!quote) return { data: null, error: "Quote not found" };

  // TODO: Map quote fields to job fields; create client if needed; set status on quote.
  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      tenant_id: ctx.tenantId,
      client_id: quote.client_id,
      title: quote.title,
      description: quote.description,
      status: "open",
      source_quote_id: quoteId,
      created_by_id: ctx.userId,
    })
    .select()
    .single();

  if (jErr) return { data: null, error: jErr.message };

  await supabase
    .from("quotes")
    .update({
      booked_job_id: job.id,
      status: "booked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId)
    .eq("tenant_id", ctx.tenantId);

  revalidatePath("/quotes");
  revalidatePath("/jobs");
  return { data: job, error: null };
}

export async function getQuotes() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
