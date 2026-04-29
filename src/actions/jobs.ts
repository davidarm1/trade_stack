"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { jobMatchesSearch } from "@/lib/job-number";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { uploadToB2 } from "@/lib/b2";
import { buildStoredInvoicePdf } from "@/lib/invoice-pdf-store";
import { sendInvoiceEmail } from "@/lib/resend";
import type { Job } from "@/types/database";
import { jobInvoiceEmailSubject } from "@/lib/job-number";

type JobInsert = Partial<
  Omit<Job, "id" | "tenant_id" | "created_at" | "updated_at">
>;

type JobInvoiceVersion = {
  id: string;
  version_no: number;
  reason: string | null;
  file_name: string;
  public_url: string;
  is_current: boolean;
  created_at: string;
};

/**
 * Calls Postgres `next_job_number(tenant_id uuid)` (Supabase RPC).
 * Adjust the RPC argument name in this call if your function uses e.g. `p_tenant_id`.
 */
export async function allocateNextJobNumber(): Promise<{
  jobNumber: number | null;
  error: string | null;
}> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { jobNumber: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("next_job_number", {
    tenant_id: ctx.tenantId,
  });

  if (error) return { jobNumber: null, error: error.message };
  if (data === null || data === undefined) {
    return { jobNumber: null, error: "next_job_number returned no value" };
  }

  const n = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(n)) {
    return { jobNumber: null, error: "Invalid job number from database" };
  }

  return { jobNumber: n, error: null };
}

export async function createJob(data: JobInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { job_number: _ignoredJobNo, ...rest } = data;
  if (!rest.client_id) {
    return {
      data: null,
      error:
        "Client is required. Pick an existing client or create one before creating a job.",
    };
  }

  const { jobNumber, error: allocErr } = await allocateNextJobNumber();
  if (allocErr || jobNumber == null) {
    return { data: null, error: allocErr ?? "Could not allocate job number" };
  }

  const { data: row, error } = await supabase
    .from("jobs")
    .insert({
      ...rest,
      tenant_id: ctx.tenantId,
      created_by_id: ctx.userId,
      job_number: jobNumber,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/jobs");
  return { data: row, error: null };
}

export async function updateJob(id: string, data: JobInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { job_number: _omitImmutable, ...safe } = data;

  const { data: row, error } = await supabase
    .from("jobs")
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  return { data: row, error: null };
}

type InvoiceMaterialInput = {
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
};

function finiteOrZero(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function recalcAndPersistJobTotals(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string;
  jobId: string;
  labourChargeOverride?: number | null;
}) {
  const { supabase, tenantId, jobId, labourChargeOverride } = args;
  const { data: job } = await supabase
    .from("jobs")
    .select("id, labour_charge, vat_rate, remove_vat")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!job) return;

  const { data: materials } = await supabase
    .from("job_materials")
    .select("total_price")
    .eq("job_id", jobId)
    .eq("tenant_id", tenantId);

  const totalMaterials = round2(
    (materials ?? []).reduce(
      (sum, m) => sum + finiteOrZero((m as { total_price?: number | null }).total_price),
      0,
    ),
  );
  const labour = round2(
    labourChargeOverride == null ? finiteOrZero(job.labour_charge) : finiteOrZero(labourChargeOverride),
  );
  const subtotal = round2(labour + totalMaterials);
  const vatRate = job.remove_vat ? 0 : finiteOrZero(job.vat_rate);
  const vatAmount = round2(subtotal * (vatRate / 100));
  const totalIncVat = round2(subtotal + vatAmount);

  await supabase
    .from("jobs")
    .update({
      total_materials: totalMaterials,
      subtotal,
      vat_amount: vatAmount,
      total_inc_vat: totalIncVat,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("tenant_id", tenantId);
}

export async function updateJobInvoiceDetails(
  id: string,
  data: Pick<
    JobInsert,
    | "custom_invoice_number"
    | "custom_po_number"
    | "client_order_number"
    | "payment_terms_days"
    | "labour_charge"
  >,
) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("jobs")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await recalcAndPersistJobTotals({
    supabase,
    tenantId: ctx.tenantId,
    jobId: id,
    labourChargeOverride: data.labour_charge ?? null,
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/jobs/${id}/invoice`);
  return { data: row, error: null };
}

export async function replaceJobInvoiceMaterials(
  id: string,
  items: InvoiceMaterialInput[],
) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const normalized = (items ?? [])
    .map((it, idx) => {
      const desc = String(it.description ?? "").trim();
      const qty = finiteOrZero(it.quantity ?? 0);
      const unit = finiteOrZero(it.unit_price ?? 0);
      if (!desc && qty === 0 && unit === 0) return null;
      return {
        tenant_id: ctx.tenantId,
        job_id: id,
        description: desc || null,
        quantity: qty,
        unit_price: unit,
        total_price: round2(qty * unit),
        sort_order: idx,
      };
    })
    .filter(Boolean);

  const { error: delErr } = await supabase
    .from("job_materials")
    .delete()
    .eq("job_id", id)
    .eq("tenant_id", ctx.tenantId);
  if (delErr) return { data: null, error: delErr.message };

  if (normalized.length > 0) {
    const { error: insErr } = await supabase
      .from("job_materials")
      .insert(normalized as never[]);
    if (insErr) return { data: null, error: insErr.message };
  }

  await recalcAndPersistJobTotals({
    supabase,
    tenantId: ctx.tenantId,
    jobId: id,
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/jobs/${id}/invoice`);
  return { data: true, error: null };
}

export async function getJobInvoiceVersions(jobId: string): Promise<{
  data: JobInvoiceVersion[] | null;
  error: string | null;
}> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_invoice_versions")
    .select("id, version_no, reason, file_name, public_url, is_current, created_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("job_id", jobId)
    .order("version_no", { ascending: false });
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as JobInvoiceVersion[], error: null };
}

export async function sendJobInvoice(
  jobId: string,
  versionReason: string | null,
  recipientEmails: string,
): Promise<{ data: { version_no: number; public_url: string } | null; error: string | null }> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();
  const recipientsRaw = String(recipientEmails ?? "").trim();
  if (!recipientsRaw) {
    return { data: null, error: "At least one recipient email is required." };
  }
  const recipients = Array.from(
    new Set(
      recipientsRaw
        .split(/[,\n;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (recipients.length === 0) {
    return { data: null, error: "At least one recipient email is required." };
  }
  const bad = recipients.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(e));
  if (bad) {
    return { data: null, error: `Invalid email address: ${bad}` };
  }

  const { data: jobMeta, error: jobMetaErr } = await supabase
    .from("jobs")
    .select("id, title, job_number, client_id")
    .eq("id", jobId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (jobMetaErr || !jobMeta) return { data: null, error: jobMetaErr?.message ?? "Job not found." };

  const { data: versions, error: verErr } = await supabase
    .from("job_invoice_versions")
    .select("id, version_no")
    .eq("tenant_id", ctx.tenantId)
    .eq("job_id", jobId)
    .order("version_no", { ascending: false });
  if (verErr) return { data: null, error: verErr.message };
  const nextVersion = ((versions?.[0]?.version_no as number | undefined) ?? 0) + 1;
  const trimmedReason = String(versionReason ?? "").trim();
  if (nextVersion > 1 && !trimmedReason) {
    return {
      data: null,
      error: "Reason is required when sending invoice version v2 or later.",
    };
  }

  const { buffer, fileName } = await buildStoredInvoicePdf({
    supabase,
    tenantId: ctx.tenantId,
    jobId,
    versionNo: nextVersion,
  });
  const key = `tradestack/${ctx.tenantId}/invoices/${jobId}/v${nextVersion}_${fileName}`;
  const url = await uploadToB2(buffer, key, "application/pdf");

  const now = new Date().toISOString();

  const { error: clearErr } = await supabase
    .from("job_invoice_versions")
    .update({ is_current: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("job_id", jobId)
    .eq("is_current", true);
  if (clearErr) return { data: null, error: clearErr.message };

  const { error: insErr } = await supabase.from("job_invoice_versions").insert({
    tenant_id: ctx.tenantId,
    job_id: jobId,
    version_no: nextVersion,
    reason: trimmedReason || null,
    file_name: fileName,
    b2_key: key,
    public_url: url,
    is_current: true,
    created_by_id: ctx.userId,
    created_at: now,
  });
  if (insErr) return { data: null, error: insErr.message };

  const { error: fileErr } = await supabase.from("tenant_files").insert({
    tenant_id: ctx.tenantId,
    job_id: jobId,
    file_type: "invoice",
    b2_key: key,
    file_name: fileName,
    file_size_bytes: buffer.length,
    public_url: url,
  });
  if (fileErr) return { data: null, error: fileErr.message };

  const subject = jobInvoiceEmailSubject({
    jobNumber: jobMeta.job_number as number | null | undefined,
    title: String(jobMeta.title ?? "Invoice"),
  });
  const reasonText = trimmedReason ? `<p><strong>Reason for this version:</strong> ${trimmedReason}</p>` : "";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <p>Hello,</p>
      <p>Please find your invoice attached via secure link:</p>
      <p><a href="${url}" target="_blank" rel="noopener noreferrer">Open invoice PDF</a></p>
      ${reasonText}
      <p>If you have any questions, please reply to this email.</p>
    </div>
  `;
  const text = [
    "Hello,",
    "",
    "Please find your invoice at the link below:",
    url,
    trimmedReason ? `Reason for this version: ${trimmedReason}` : "",
    "",
    "If you have any questions, please reply to this email.",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await sendInvoiceEmail({
      to: recipients,
      subject,
      html,
      text,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email send failed.";
    return {
      data: null,
      error: `Invoice PDF stored, but email sending failed: ${message}`,
    };
  }

  const { error: jobErr } = await supabase
    .from("jobs")
    .update({
      invoice_sent_at: now,
      invoice_sent_to_email: recipients.join(", "),
      updated_at: now,
      status: "invoiced",
    })
    .eq("id", jobId)
    .eq("tenant_id", ctx.tenantId);
  if (jobErr) return { data: null, error: jobErr.message };

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/invoice`);
  return { data: { version_no: nextVersion, public_url: url }, error: null };
}

export async function deleteJob(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { error } = await supabase
    .from("jobs")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { data: null, error: error.message };
  revalidatePath("/jobs");
  return { data: true, error: null };
}

export async function getJobs(options?: { search?: string }) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };

  const clientIds = Array.from(
    new Set(
      (jobs ?? [])
        .map((j: { client_id?: string | null }) => j.client_id)
        .filter(Boolean) as string[],
    ),
  );

  let clientsById: Record<string, { id: string; company_name: string }> = {};
  if (clientIds.length > 0) {
    const { data: clientRows, error: clientsError } = await supabase
      .from("clients")
      .select("id, company_name")
      .eq("tenant_id", ctx.tenantId)
      .in("id", clientIds);
    if (clientsError) {
      return { data: null, error: clientsError.message };
    }
    clientsById = Object.fromEntries(
      (clientRows ?? []).map((c) => [c.id, c]),
    );
  }

  const engineerIds = Array.from(
    new Set(
      (jobs ?? [])
        .map((j: { assigned_engineer_id?: string | null }) => j.assigned_engineer_id)
        .filter(Boolean) as string[],
    ),
  );

  let engineers: Record<string, { id: string; name: string | null }> = {};
  if (engineerIds.length > 0) {
    const { data: engRows } = await supabase
      .from("users")
      .select("id, name")
      .eq("tenant_id", ctx.tenantId)
      .in("id", engineerIds);
    engineers = Object.fromEntries(
      (engRows ?? []).map((e) => [e.id, e]),
    );
  }

  const enriched = (jobs ?? []).map(
    (j: {
      id: string;
      client_id?: string | null;
      assigned_engineer_id?: string | null;
      [key: string]: unknown;
    }) => ({
      ...j,
      client_name: j.client_id
        ? clientsById[j.client_id]?.company_name ?? null
        : null,
      engineer_name: j.assigned_engineer_id
        ? engineers[j.assigned_engineer_id]?.name ?? null
        : null,
    }),
  );

  const q = options?.search?.trim() ?? "";
  const filtered = q
    ? enriched.filter((j) =>
        jobMatchesSearch(
          j as Parameters<typeof jobMatchesSearch>[0],
          q,
        ),
      )
    : enriched;

  const filteredIds = filtered.map((j) => j.id);
  const logsByJob: Record<string, { id: string; sent_at: string }[]> = {};

  if (filteredIds.length > 0) {
    const { data: logRows, error: logError } = await supabase
      .from("job_invoice_send_log")
      .select("id, job_id, sent_at")
      .eq("tenant_id", ctx.tenantId)
      .in("job_id", filteredIds)
      .order("sent_at", { ascending: false });

    if (logError) return { data: null, error: logError.message };

    for (const row of logRows ?? []) {
      const jid = row.job_id as string;
      const list = logsByJob[jid] ?? [];
      list.push({
        id: row.id as string,
        sent_at: row.sent_at as string,
      });
      logsByJob[jid] = list;
    }

    for (const jid of Object.keys(logsByJob)) {
      logsByJob[jid].sort(
        (a, b) =>
          new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
      );
    }
  }

  const withLogs = filtered.map((j) => ({
    ...j,
    invoice_send_log: logsByJob[j.id] ?? [],
  }));

  return { data: withLogs, error: null };
}

export const getJob = cache(async function getJob(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (jobError) return { data: null, error: jobError.message };
  if (!job) return { data: null, error: "Job not found" };

  let clientRow: Record<string, unknown> | null = null;
  if (job.client_id) {
    const { data: c } = await supabase
      .from("clients")
      .select("*")
      .eq("id", job.client_id)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    clientRow = c;
  }

  let engineer: { id: string; name: string | null; email: string | null } | null =
    null;
  if (job.assigned_engineer_id) {
    const { data: e } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("id", job.assigned_engineer_id)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    engineer = e;
  }

  const { data: materials } = await supabase
    .from("job_materials")
    .select("*")
    .eq("job_id", id)
    .eq("tenant_id", ctx.tenantId)
    .order("sort_order", { ascending: true });

  const { data: completion } = await supabase
    .from("job_completions")
    .select("*")
    .eq("job_id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  const { data: images } = await supabase
    .from("job_images")
    .select("*")
    .eq("job_id", id)
    .eq("tenant_id", ctx.tenantId)
    .order("uploaded_at", { ascending: false });

  return {
    data: {
      job: { ...job, engineer, clients: clientRow },
      materials: materials ?? [],
      completion,
      images: images ?? [],
    },
    error: null,
  };
});
