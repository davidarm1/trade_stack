import { forbidden, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PlatformAdminSession = {
  userId: string;
  admin: SupabaseClient;
};

/**
 * Resolves the signed-in user and checks that they are an explicit platform admin.
 *
 * Unauthenticated requests are sent to /login.
 * Authenticated non-admin users get a 403 via `forbidden()`.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const admin = createServiceRoleClient();
  const { data: membership, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!membership) {
    forbidden();
  }

  return { userId: user.id, admin };
}
