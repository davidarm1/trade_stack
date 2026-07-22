import "server-only";

import { forbidden, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluatePlatformAdminAccess } from "@/lib/platform-admin-access";
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
 * Allowlisted admins must complete MFA (AAL2) before cross-tenant access.
 *
 * Grants are manual / service-role only — there is no tenant UI to add rows to platform_admins.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const provisional = evaluatePlatformAdminAccess({
    userId: authError || !user ? null : user.id,
    isAllowlisted: false,
  });
  if (provisional.status === "unauthenticated") {
    redirect("/login");
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasTotp = Boolean(factors?.totp.length);
  if (!hasTotp) {
    redirect("/account/security?required=true");
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2") {
    redirect("/mfa");
  }

  const admin = createServiceRoleClient();
  const { data: membership, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const access = evaluatePlatformAdminAccess({
    userId: user!.id,
    isAllowlisted: Boolean(membership),
  });

  if (access.status !== "ok") {
    forbidden();
  }

  return { userId: access.userId, admin };
}
