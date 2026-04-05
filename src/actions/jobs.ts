"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Job } from "@/types/database";

type JobInsert = Partial<
  Omit<Job, "id" | "tenant_id" | "created_at" | "updated_at">
>;

export async function createJob(data: JobInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: row, error } = await supabase
    .from("jobs")
    .insert({
      ...data,
      tenant_id: ctx.tenantId,
      created_by_id: ctx.userId,
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
  const supabase = createClient();

  const { data: row, error } = await supabase
    .from("jobs")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  return { data: row, error: null };
}

export async function deleteJob(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

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

export async function getJobs() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      `
      *,
      clients ( company_name )
    `,
    )
    .eq("tenant_id", ctx.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };

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
      assigned_engineer_id?: string | null;
      clients?: { company_name: string | null } | null;
      [key: string]: unknown;
    }) => ({
      ...j,
      client_name: j.clients?.company_name ?? null,
      engineer_name: j.assigned_engineer_id
        ? engineers[j.assigned_engineer_id]?.name ?? null
        : null,
    }),
  );

  return { data: enriched, error: null };
}

export async function getJob(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      `
      *,
      clients ( * )
    `,
    )
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (jobError) return { data: null, error: jobError.message };
  if (!job) return { data: null, error: "Job not found" };

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
      job: { ...job, engineer },
      materials: materials ?? [],
      completion,
      images: images ?? [],
    },
    error: null,
  };
}
