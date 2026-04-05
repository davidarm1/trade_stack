"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import type { UserRow } from "@/types/database";

type UserUpdate = Partial<
  Omit<UserRow, "id" | "tenant_id" | "created_at" | "updated_at">
>;

export async function getTeamMembers() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updateTeamMember(id: string, data: UserUpdate) {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = createClient();

  const { data: row, error } = await supabase
    .from("users")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/team");
  return { data: row, error: null };
}
