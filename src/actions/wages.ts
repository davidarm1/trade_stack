"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext, getCurrentUserRole } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { postcodeDistanceMiles } from "@/lib/postcode-distance";
import { resolveTravelDistanceSettings } from "@/lib/travel-distance-settings";

async function requireWageManagerContext() {
  const ctx = await getTenantContext();
  if (!ctx.success) return ctx;
  const role = await getCurrentUserRole();
  if (role !== "owner" && role !== "office") {
    return {
      success: false as const,
      error: "Only owners and office staff can apply travel pay.",
    };
  }
  return ctx;
}

export async function getWages(filters?: {
  userId?: string;
  periodFrom?: string;
  periodTo?: string;
}) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  let q = supabase
    .from("wages")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("period_date", { ascending: false });

  if (filters?.userId) {
    q = q.eq("user_id", filters.userId);
  }
  if (filters?.periodFrom) {
    q = q.gte("period_date", filters.periodFrom);
  }
  if (filters?.periodTo) {
    q = q.lte("period_date", filters.periodTo);
  }

  const { data, error } = await q;

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function approveWage(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("wages")
    .update({
      approval_status: "approved",
      approved_by_id: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/wages");
  return { data: row, error: null };
}

export type ApprovedTravelHoursResult = {
  totalHours: number;
  /** Distance rule configured but a job's site postcode couldn't be geocoded — hours were still included (fail open), review manually. */
  undeterminedCount: number;
  /** Distance rule active (depot postcode + threshold both configured). */
  distanceRuleActive: boolean;
};

/**
 * Sums travel_hours from *approved* timesheets for a user within an
 * explicit date range — office picks the range rather than this guessing
 * at what a wage row's single `period_date` is meant to represent (no
 * period-length convention was found anywhere in the codebase).
 *
 * If a depot postcode + distance threshold are configured (Settings —
 * separate from any client-facing travel pricing, per your answer that
 * these are independent rules), a visit's travel_hours only count if its
 * job's site is at or beyond that distance from the depot. Distance is
 * cached on jobs.travel_distance_miles after first lookup. A postcode
 * that can't be geocoded fails open (hours still counted) rather than
 * silently underpaying someone over a lookup failure — undeterminedCount
 * tells the caller to flag that for manual review.
 */
export async function getApprovedTravelHours(
  userId: string,
  periodFrom: string,
  periodTo: string,
): Promise<{ data: ApprovedTravelHoursResult | null; error: string | null }> {
  const ctx = await requireWageManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("timesheets")
    .select("travel_hours, job_id")
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", userId)
    .eq("status", "approved")
    .gte("shift_date", periodFrom)
    .lte("shift_date", periodTo);

  if (error) return { data: null, error: error.message };

  const { data: settingsRows, error: settingsErr } = await supabase
    .from("settings")
    .select("field_key, field_value")
    .eq("tenant_id", ctx.tenantId);
  if (settingsErr) return { data: null, error: settingsErr.message };
  const settingsMap = Object.fromEntries(
    (settingsRows ?? []).map((r) => [String(r.field_key), String(r.field_value ?? "")]),
  );
  const { depotPostcode, thresholdMiles } = resolveTravelDistanceSettings(settingsMap);
  const distanceRuleActive = Boolean(depotPostcode && thresholdMiles != null);

  if (!distanceRuleActive) {
    const totalHours = (rows ?? []).reduce(
      (sum, row) => sum + (Number(row.travel_hours) || 0),
      0,
    );
    return {
      data: { totalHours, undeterminedCount: 0, distanceRuleActive: false },
      error: null,
    };
  }

  let totalHours = 0;
  let undeterminedCount = 0;
  const jobIds = [...new Set((rows ?? []).map((r) => r.job_id).filter(Boolean))] as string[];
  const distanceByJobId = new Map<string, number | null>();

  for (const jobId of jobIds) {
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, site_postcode, travel_distance_miles")
      .eq("id", jobId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (jobErr || !job) {
      distanceByJobId.set(jobId, null);
      continue;
    }
    if (job.travel_distance_miles != null) {
      distanceByJobId.set(jobId, Number(job.travel_distance_miles));
      continue;
    }
    if (!job.site_postcode) {
      distanceByJobId.set(jobId, null);
      continue;
    }
    const miles = await postcodeDistanceMiles(depotPostcode!, job.site_postcode);
    distanceByJobId.set(jobId, miles);
    if (miles != null) {
      await supabase
        .from("jobs")
        .update({ travel_distance_miles: miles })
        .eq("id", jobId)
        .eq("tenant_id", ctx.tenantId);
    }
  }

  for (const row of rows ?? []) {
    const hours = Number(row.travel_hours) || 0;
    if (hours <= 0) continue;
    const distance = row.job_id ? distanceByJobId.get(row.job_id) : null;
    if (distance == null) {
      // Fail open: no job link, or geocoding failed — count it, flag it.
      totalHours += hours;
      undeterminedCount += 1;
      continue;
    }
    if (distance >= thresholdMiles!) {
      totalHours += hours;
    }
  }

  return {
    data: { totalHours, undeterminedCount, distanceRuleActive: true },
    error: null,
  };
}

/**
 * Tops up an *existing* wage row's travel_hours/travel_wage from approved
 * timesheets in the given range, and recomputes total_wage. Deliberately
 * does not create wage rows from scratch — how those get created in the
 * first place wasn't found anywhere in this codebase (no generation logic
 * exists), and this shouldn't guess at that. Mirrors how overtime_wage
 * already sits alongside base_wage on the same row, per your steer that
 * wages are fixed/salaried with only variable amounts (overtime, now
 * travel) added on top.
 */
export async function applyTravelPayToWage(
  wageId: string,
  periodFrom: string,
  periodTo: string,
) {
  const ctx = await requireWageManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: wage, error: wageErr } = await supabase
    .from("wages")
    .select("id, user_id, base_wage, overtime_wage")
    .eq("id", wageId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (wageErr) return { data: null, error: wageErr.message };
  if (!wage) return { data: null, error: "Wage record not found." };
  if (!wage.user_id) return { data: null, error: "Wage record has no user." };

  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("travel_rate")
    .eq("id", wage.user_id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (userErr) return { data: null, error: userErr.message };
  const travelRate = Number(user?.travel_rate) || 0;
  if (!travelRate) {
    return {
      data: null,
      error: "This user has no travel_rate set — add one in Team first.",
    };
  }

  const { data: summary, error: hoursErr } = await getApprovedTravelHours(
    wage.user_id,
    periodFrom,
    periodTo,
  );
  if (hoursErr || summary == null) {
    return { data: null, error: hoursErr ?? "Could not total travel hours." };
  }

  const travelWage = summary.totalHours * travelRate;
  const totalWage =
    (Number(wage.base_wage) || 0) + (Number(wage.overtime_wage) || 0) + travelWage;

  const { data: updated, error: updateErr } = await supabase
    .from("wages")
    .update({
      travel_hours: summary.totalHours,
      travel_wage: travelWage,
      total_wage: totalWage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", wageId)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();
  if (updateErr) return { data: null, error: updateErr.message };

  revalidatePath("/wages");
  return {
    data: { wage: updated, undeterminedCount: summary.undeterminedCount },
    error: null,
  };
}

export async function rejectWage(id: string, reason: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("wages")
    .update({
      approval_status: "rejected",
      rejection_reason: reason,
      approved_by_id: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/wages");
  return { data: row, error: null };
}
