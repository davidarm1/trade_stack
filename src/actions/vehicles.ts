"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { Vehicle, VehicleMaintenanceLogEntry } from "@/types/database";

type VehicleInsert = Partial<
  Omit<Vehicle, "id" | "tenant_id" | "created_at" | "updated_at">
>;

export async function getVehicles() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true)
    .order("registration", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as Vehicle[], error: null };
}

export async function getVehicle(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as Vehicle | null, error: null };
}

export async function createVehicle(data: VehicleInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("vehicles")
    .insert({ ...data, tenant_id: ctx.tenantId })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/vans");
  return { data: row as Vehicle, error: null };
}

export async function updateVehicle(id: string, data: VehicleInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("vehicles")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/vans");
  revalidatePath(`/vans/${id}`);
  return { data: row as Vehicle, error: null };
}

export async function getMaintenanceLog(vehicleId: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicle_maintenance_log")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("vehicle_id", vehicleId)
    .order("logged_date", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as VehicleMaintenanceLogEntry[], error: null };
}

export async function addMaintenanceLogEntry(args: {
  vehicleId: string;
  loggedDate: string;
  description: string;
  cost?: number | null;
}) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("vehicle_maintenance_log")
    .insert({
      tenant_id: ctx.tenantId,
      vehicle_id: args.vehicleId,
      logged_date: args.loggedDate,
      description: args.description,
      cost: args.cost ?? null,
      created_by_id: ctx.userId,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath(`/vans/${args.vehicleId}`);
  return { data: row as VehicleMaintenanceLogEntry, error: null };
}

/**
 * Vehicles with an MOT or insurance renewal due within `withinDays` (default
 * 30) — feeds the renewal-reminder job (see docs/Van Maintenance spec).
 */
export async function getUpcomingRenewals(withinDays = 30) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true)
    .or(
      `mot_due_date.lte.${cutoffStr},insurance_renewal_date.lte.${cutoffStr}`,
    );

  if (error) return { data: null, error: error.message };
  return { data: data as Vehicle[], error: null };
}
