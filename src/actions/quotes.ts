"use server";

import { createClient as createClientRecord } from "@/actions/clients";
import { createClient } from "@/lib/supabase/server";
import { allocateNextJobNumber } from "@/actions/jobs";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Quote } from "@/types/database";

type QuoteInsert = Partial<
  Omit<Quote, "id" | "tenant_id" | "created_at" | "updated_at" | "deleted_at">
>;

export async function createQuote(data: QuoteInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const envStatus = process.env.QUOTE_INSERT_STATUS?.trim();
  const insertPayload: Record<string, unknown> = {
    ...data,
    tenant_id: ctx.tenantId,
    created_by_id: ctx.userId,
  };

  if (envStatus) {
    insertPayload.status = envStatus;
  } else if (
    insertPayload.status === undefined ||
    insertPayload.status === null ||
    insertPayload.status === ""
  ) {
    delete insertPayload.status;
  }

  const { data: row, error } = await supabase
    .from("quotes")
    .insert(insertPayload as never)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/quotes");
  return { data: row, error: null };
}

export async function convertQuoteToJob(quoteId: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (qErr) return { data: null, error: qErr.message };
  if (!quote) return { data: null, error: "Quote not found" };
  if (quote.status === "booked") {
    return { data: null, error: "This quote is already converted to a job." };
  }

  const q = quote as Quote;
  let clientId = q.client_id;

  if (!clientId) {
    const nameTrim = String(q.customer_name ?? "").trim();
    const titleTrim = String(q.title ?? "").trim();
    const company = (nameTrim || titleTrim || "Customer").slice(0, 200);

    const ins = await createClientRecord({
      company_name: company,
      contact_name: nameTrim || null,
      contact_email: String(q.customer_email ?? "").trim() || null,
      contact_number: String(q.customer_phone ?? "").trim() || null,
      address1: String(q.address1 ?? "").trim() || null,
      address2: String(q.address2 ?? "").trim() || null,
      town: String(q.town ?? "").trim() || null,
      postcode: String(q.postcode ?? "").trim() || null,
      site_address1: String(q.address1 ?? "").trim() || null,
      site_address2: String(q.address2 ?? "").trim() || null,
      site_town: String(q.town ?? "").trim() || null,
      site_postcode: String(q.postcode ?? "").trim() || null,
      is_active: true,
    });

    if (ins.error || !ins.data) {
      return {
        data: null,
        error:
          ins.error ??
          "Could not create a client from this quote. Match a client on the quote or add one in Clients, then try again.",
      };
    }

    clientId = ins.data.id;

    await supabase
      .from("quotes")
      .update({
        client_id: clientId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId)
      .eq("tenant_id", ctx.tenantId);
  }

  const { jobNumber, error: allocErr } = await allocateNextJobNumber();
  if (allocErr || jobNumber == null) {
    return { data: null, error: allocErr ?? "Could not allocate job number" };
  }

  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      tenant_id: ctx.tenantId,
      client_id: clientId,
      title: quote.title,
      description: quote.description,
      status: "open",
      source_quote_id: quoteId,
      created_by_id: ctx.userId,
      job_number: jobNumber,
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
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  const activeQuotes = (data ?? []).filter(
    (q: { status?: string | null; booked_job_id?: string | null }) =>
      (q.status ?? "").toLowerCase() !== "booked" && !q.booked_job_id,
  );
  return { data: activeQuotes, error: null };
}

export async function getQuote(quoteId: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updateQuote(quoteId: string, data: QuoteInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { error: ctx.error };
  const supabase = await createClient();

  const { error } = await supabase
    .from("quotes")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return { error: null };
}

export async function softDeleteQuote(quoteId: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { error: ctx.error };
  const supabase = await createClient();

  const { error } = await supabase
    .from("quotes")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { error: error.message };
  revalidatePath("/quotes");
  return { error: null };
}
