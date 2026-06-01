"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

export type ContactMethod = "phone" | "email" | "sms" | "in_person" | "letter" | "other";
export type FollowupStatus =
  | "chased"
  | "awaiting_reply"
  | "promised_payment"
  | "dispute"
  | "escalated"
  | "resolved";

export type FollowupRow = {
  job_id: string;
  status: FollowupStatus | null;
  outcome: string | null;
  next_action_date: string | null;
  contacted_at: string | null;
  contact_method: ContactMethod | null;
  contacted_by_id: string | null;
};

export async function logFollowUp(data: {
  jobId: string;
  contactMethod: ContactMethod;
  status: FollowupStatus;
  outcome?: string | null;
  nextActionDate?: string | null;
}): Promise<{ error: string | null }> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { error: ctx.error };
  const supabase = await createClient();

  const { error } = await supabase.from("contact_log").insert({
    tenant_id: ctx.tenantId,
    job_id: data.jobId,
    contact_method: data.contactMethod,
    status: data.status,
    outcome: data.outcome?.trim() || null,
    next_action_date: data.nextActionDate ?? null,
    contacted_by_id: ctx.userId,
    contacted_at: new Date().toISOString(),
  });

  if (error) return { error: error.message };
  revalidatePath("/jobs");
  return { error: null };
}

export async function getJobLatestFollowups(): Promise<{
  data: FollowupRow[] | null;
  error: string | null;
}> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_latest_followup")
    .select(
      "job_id, status, outcome, next_action_date, contacted_at, contact_method, contacted_by_id",
    )
    .eq("tenant_id", ctx.tenantId);

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as FollowupRow[], error: null };
}
