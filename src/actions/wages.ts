"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext, getCurrentUserRole } from "@/lib/tenant";
import { revalidatePath } from "next/cache";

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

/**
 * Sums travel_hours from *approved* timesheets for a user within an
 * explicit date range — office picks the range rather than this guessing
 * at what a wage row's single `period_date` is meant to represent (no
 * period-length convention was found anywhere in the codebase).
 */
export async function getApprovedTravelHours(
  userId: string,
  periodFrom: string,
  periodTo: string,
) {
  const ctx = await requireWageManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("timesheets")
    .select("travel_hours")
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", userId)
    .eq("status", "approved")
    .gte("shift_date", periodFrom)
    .lte("shift_date", periodTo);

  if (error) return { data: null, error: error.message };
  const totalHours = (data ?? []).reduce(
    (sum, row) => sum + (Number(row.travel_hours) || 0),
    0,
  );
  return { data: totalHours, error: null };
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

  const { data: travelHours, error: hoursErr } = await getApprovedTravelHours(
    wage.user_id,
    periodFrom,
    periodTo,
  );
  if (hoursErr || travelHours == null) {
    return { data: null, error: hoursErr ?? "Could not total travel hours." };
  }

  const travelWage = travelHours * travelRate;
  const totalWage =
    (Number(wage.base_wage) || 0) + (Number(wage.overtime_wage) || 0) + travelWage;

  const { data: updated, error: updateErr } = await supabase
    .from("wages")
    .update({
      travel_hours: travelHours,
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
  return { data: updated, error: null };
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
