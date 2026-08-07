import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export type TenantContext =
  | { success: true; userId: string; tenantId: string }
  | { success: false; error: string };

export async function getTenantContext(): Promise<TenantContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { success: false, error: profileError.message };
  }

  if (!profile?.tenant_id) {
    return {
      success: false,
      error: "No tenant profile — complete onboarding or contact support.",
    };
  }

  return {
    success: true,
    userId: user.id,
    tenantId: profile.tenant_id,
  };
}

/**
 * Current user's tenant role, or null if unauthenticated/no profile. Added
 * for the onboarding-documents and email-marketing manager checks — note
 * there may be a similar/overlapping helper (and a role-gated
 * `requireApproverContext`) in your in-progress uncommitted wages/timesheets
 * work on `main`; reconcile on merge rather than assuming this is the only
 * version.
 */
export async function getCurrentUserRole(): Promise<UserRole | null> {
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
