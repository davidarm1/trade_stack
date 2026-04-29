import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import type { UserRole } from "@/types/database";

export async function getDashboardUserRole(): Promise<UserRole | null> {
  const ctx = await getTenantContext();
  if (!ctx.success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  return (data?.role as UserRole | null) ?? null;
}
