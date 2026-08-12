"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { StockItem, StockMovement } from "@/types/database";

type StockItemInsert = Partial<
  Omit<StockItem, "id" | "tenant_id" | "created_at" | "updated_at" | "current_qty">
>;

export async function getStockItems() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_items")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as StockItem[], error: null };
}

export async function getStockItem(id: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_items")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as StockItem | null, error: null };
}

export async function getStockMovements(stockItemId: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("stock_item_id", stockItemId)
    .order("moved_at", { ascending: false })
    .limit(50);

  if (error) return { data: null, error: error.message };
  return { data: data as StockMovement[], error: null };
}

export async function createStockItem(data: StockItemInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("stock_items")
    .insert({ ...data, tenant_id: ctx.tenantId, current_qty: 0 })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/store-room");
  return { data: row as StockItem, error: null };
}

export async function updateStockItem(id: string, data: StockItemInsert) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("stock_items")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/store-room");
  revalidatePath(`/store-room/${id}`);
  return { data: row as StockItem, error: null };
}

/**
 * Book stock in or out. Not race-safe under concurrent bookings of the same
 * item (read-then-write on current_qty) — fine for a single small team;
 * revisit with a Postgres RPC (atomic UPDATE ... SET current_qty = current_qty ± qty)
 * if this becomes contended.
 */
async function moveStock(args: {
  stockItemId: string;
  direction: "out" | "in";
  quantity: number;
  jobId?: string | null;
  vehicleId?: string | null;
  notes?: string | null;
}) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  if (args.quantity <= 0) {
    return { data: null, error: "Quantity must be greater than zero." };
  }
  const supabase = await createClient();

  const { data: item, error: itemErr } = await supabase
    .from("stock_items")
    .select("id, current_qty")
    .eq("id", args.stockItemId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (itemErr) return { data: null, error: itemErr.message };
  if (!item) return { data: null, error: "Stock item not found." };

  const delta = args.direction === "in" ? args.quantity : -args.quantity;
  const nextQty = Number(item.current_qty) + delta;
  if (nextQty < 0) {
    return { data: null, error: "Not enough stock to book out that quantity." };
  }

  const { error: moveErr } = await supabase.from("stock_movements").insert({
    tenant_id: ctx.tenantId,
    stock_item_id: args.stockItemId,
    direction: args.direction,
    quantity: args.quantity,
    job_id: args.jobId ?? null,
    vehicle_id: args.vehicleId ?? null,
    membership_id: ctx.membershipId,
    notes: args.notes ?? null,
  });
  if (moveErr) return { data: null, error: moveErr.message };

  const { data: updated, error: updateErr } = await supabase
    .from("stock_items")
    .update({ current_qty: nextQty, updated_at: new Date().toISOString() })
    .eq("id", args.stockItemId)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (updateErr) return { data: null, error: updateErr.message };
  revalidatePath("/store-room");
  revalidatePath(`/store-room/${args.stockItemId}`);
  return { data: updated as StockItem, error: null };
}

export async function bookStockOut(args: {
  stockItemId: string;
  quantity: number;
  jobId?: string | null;
  vehicleId?: string | null;
  notes?: string | null;
}) {
  return moveStock({ ...args, direction: "out" });
}

export async function bookStockIn(args: {
  stockItemId: string;
  quantity: number;
  notes?: string | null;
}) {
  return moveStock({ ...args, direction: "in" });
}
