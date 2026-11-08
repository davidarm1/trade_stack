import "server-only";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendJobInvoiceCore } from "@/lib/send-job-invoice";
import { sendInvoiceEmail } from "@/lib/resend";

/** A job stuck in "sending" longer than this is treated as a crashed run. */
const SENDING_TIMEOUT_MS = 15 * 60 * 1000;

type DueJob = {
  id: string;
  tenant_id: string;
  job_number: number | null;
  title: string | null;
  approved_at: string | null;
  invoice_sent_at: string | null;
  total_inc_vat: number | string | null;
  invoice_scheduled_recipients: string | null;
  invoice_scheduled_reason: string | null;
  invoice_scheduled_by_id: string | null;
  invoice_scheduled_by_membership_id: string | null;
};

export type ScheduledInvoiceResult = {
  jobId: string;
  status: "sent" | "failed" | "cancelled";
  error?: string;
};

type Admin = ReturnType<typeof createServiceRoleClient>;

async function notifyOwners(
  admin: Admin,
  job: Pick<DueJob, "id" | "tenant_id" | "job_number" | "title">,
  reason: string,
) {
  try {
    const { data: owners } = await admin
      .from("memberships")
      .select("user_id")
      .eq("company_id", job.tenant_id)
      .eq("role", "owner")
      .eq("status", "active");
    const ids = [...new Set((owners ?? []).map((m) => m.user_id as string))];
    if (ids.length === 0) return;
    const { data: users } = await admin.from("users").select("email").in("id", ids);
    const to = (users ?? [])
      .map((u) => String(u.email ?? "").trim())
      .filter(Boolean);
    if (to.length === 0) return;

    const label = `JOB-${job.job_number ?? "?"}${job.title ? ` ${job.title}` : ""}`;
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    const link = base ? `${base}/jobs/${job.id}` : "";
    const text = [
      `The scheduled invoice for ${label} could not be sent.`,
      "",
      `Reason: ${reason}`,
      "",
      "Open the job to fix the problem and reschedule or send it by hand.",
      link,
    ]
      .filter((l) => l !== undefined)
      .join("\n");
    await sendInvoiceEmail({
      to,
      subject: `Scheduled invoice failed — ${label}`,
      html: `<p>The scheduled invoice for <strong>${escapeHtml(label)}</strong> could not be sent.</p><p>Reason: ${escapeHtml(reason)}</p><p>Open the job to fix the problem and reschedule or send it by hand.</p>${link ? `<p><a href="${link}">${link}</a></p>` : ""}`,
      text,
    });
  } catch (e) {
    console.error("[scheduled-invoices] could not notify owners:", e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

async function markFailed(admin: Admin, job: DueJob, reason: string) {
  await admin
    .from("jobs")
    .update({ invoice_schedule_status: "failed", invoice_schedule_error: reason })
    .eq("id", job.id)
    .eq("tenant_id", job.tenant_id);
  await notifyOwners(admin, job, reason);
}

/**
 * Sends every invoice whose scheduled time has passed. Safe to call often and
 * concurrently: each job is claimed with a conditional update before sending,
 * so a job can only be sent by one run.
 */
export async function processScheduledInvoices(
  opts: { limit?: number; now?: Date } = {},
): Promise<ScheduledInvoiceResult[]> {
  const now = opts.now ?? new Date();
  const admin = createServiceRoleClient();
  const results: ScheduledInvoiceResult[] = [];

  // Recover jobs left in "sending" by a crashed run: surface them instead of
  // leaving them silently stuck (the invoice may or may not have gone out).
  const stale = new Date(now.getTime() - SENDING_TIMEOUT_MS).toISOString();
  const { data: stuck } = await admin
    .from("jobs")
    .select("id, tenant_id, job_number, title")
    .eq("invoice_schedule_status", "sending")
    .lt("invoice_schedule_claimed_at", stale);
  for (const j of stuck ?? []) {
    const reason =
      "The scheduled send timed out. Check whether the invoice was emailed before rescheduling.";
    await admin
      .from("jobs")
      .update({ invoice_schedule_status: "failed", invoice_schedule_error: reason })
      .eq("id", j.id)
      .eq("invoice_schedule_status", "sending");
    await notifyOwners(admin, j, reason);
    results.push({ jobId: j.id, status: "failed", error: reason });
  }

  const { data: due, error } = await admin
    .from("jobs")
    .select(
      "id, tenant_id, job_number, title, approved_at, invoice_sent_at, total_inc_vat, invoice_scheduled_recipients, invoice_scheduled_reason, invoice_scheduled_by_id, invoice_scheduled_by_membership_id",
    )
    .eq("invoice_schedule_status", "scheduled")
    .lte("invoice_scheduled_for", now.toISOString())
    .order("invoice_scheduled_for", { ascending: true })
    .limit(opts.limit ?? 10);
  if (error) throw new Error(error.message);

  for (const job of (due ?? []) as DueJob[]) {
    // Claim: only one run wins this update.
    const { data: claimed } = await admin
      .from("jobs")
      .update({
        invoice_schedule_status: "sending",
        invoice_schedule_claimed_at: now.toISOString(),
        invoice_schedule_error: null,
      })
      .eq("id", job.id)
      .eq("invoice_schedule_status", "scheduled")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    try {
      if (job.invoice_sent_at) {
        await admin
          .from("jobs")
          .update({
            invoice_schedule_status: "cancelled",
            invoice_schedule_error: "The invoice had already been sent.",
          })
          .eq("id", job.id);
        results.push({ jobId: job.id, status: "cancelled" });
        continue;
      }
      let failure: string | null = null;
      if (!job.approved_at) failure = "The job is no longer approved.";
      else if (!(Number(job.total_inc_vat ?? 0) > 0)) failure = "The invoice total is £0.00.";
      else if (!job.invoice_scheduled_by_id) failure = "No scheduling user was recorded.";
      if (failure) {
        await markFailed(admin, job, failure);
        results.push({ jobId: job.id, status: "failed", error: failure });
        continue;
      }

      const sent = await sendJobInvoiceCore({
        supabase: admin,
        tenantId: job.tenant_id,
        actor: {
          userId: job.invoice_scheduled_by_id!,
          membershipId: job.invoice_scheduled_by_membership_id,
        },
        jobId: job.id,
        versionReason: job.invoice_scheduled_reason,
        recipientEmails: job.invoice_scheduled_recipients ?? "",
      });
      if (sent.error) {
        await markFailed(admin, job, sent.error);
        results.push({ jobId: job.id, status: "failed", error: sent.error });
        continue;
      }
      await admin
        .from("jobs")
        .update({ invoice_schedule_status: "sent", invoice_schedule_error: null })
        .eq("id", job.id);
      revalidatePath("/jobs");
      revalidatePath(`/jobs/${job.id}`);
      results.push({ jobId: job.id, status: "sent" });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Unexpected error while sending.";
      await markFailed(admin, job, reason);
      results.push({ jobId: job.id, status: "failed", error: reason });
    }
  }
  return results;
}
