"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { StockItem, VanStock } from "@/types/database";

export type VanStockRow = VanStock & { stock_item: StockItem | null };

export async function getVanStock(vehicleId: string) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("van_stock")
    .select("*, stock_item:stock_items(*)")
    .eq("tenant_id", ctx.tenantId)
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as VanStockRow[], error: null };
}

/**
 * Allocate stock from the store room to a van: decrements the store-room
 * item (via a `stock_movements` "out" row, vehicle-tagged) and upserts the
 * van's running quantity for that item.
 */
export async function allocateStockToVan(args: {
  vehicleId: string;
  stockItemId: string;
  quantity: number;
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
  if (Number(item.current_qty) < args.quantity) {
    return { data: null, error: "Not enough store-room stock to allocate." };
  }

  const { error: moveErr } = await supabase.from("stock_movements").insert({
    tenant_id: ctx.tenantId,
    stock_item_id: args.stockItemId,
    direction: "out",
    quantity: args.quantity,
    vehicle_id: args.vehicleId,
    user_id: ctx.userId,
    notes: "Allocated to van",
  });
  if (moveErr) return { data: null, error: moveErr.message };

  const { error: itemUpdateErr } = await supabase
    .from("stock_items")
    .update({
      current_qty: Number(item.current_qty) - args.quantity,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.stockItemId)
    .eq("tenant_id", ctx.tenantId);
  if (itemUpdateErr) return { data: null, error: itemUpdateErr.message };

  const { data: existing } = await supabase
    .from("van_stock")
    .select("id, quantity")
    .eq("tenant_id", ctx.tenantId)
    .eq("vehicle_id", args.vehicleId)
    .eq("stock_item_id", args.stockItemId)
    .maybeSingle();

  if (existing) {
    const { data: row, error } = await supabase
      .from("van_stock")
      .update({
        quantity: Number(existing.quantity) + args.quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return { data: null, error: error.message };
    revalidatePath(`/van-stock/${args.vehicleId}`);
    return { data: row as VanStock, error: null };
  }

  const { data: row, error } = await supabase
    .from("van_stock")
    .insert({
      tenant_id: ctx.tenantId,
      vehicle_id: args.vehicleId,
      stock_item_id: args.stockItemId,
      quantity: args.quantity,
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  revalidatePath(`/van-stock/${args.vehicleId}`);
  return { data: row as VanStock, error: null };
}

/** Engineer confirms/corrects the counted quantity for a stock check. */
export async function recordVanStockCheck(args: {
  vanStockId: string;
  countedQuantity: number;
}) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  if (args.countedQuantity < 0) {
    return { data: null, error: "Quantity cannot be negative." };
  }
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("van_stock")
    .update({
      quantity: args.countedQuantity,
      last_checked_at: new Date().toISOString(),
      last_checked_by_id: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.vanStockId)
    .eq("tenant_id", ctx.tenantId)
    .select("vehicle_id")
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath(`/van-stock/${row.vehicle_id}`);
  return { data: row, error: null };
}
