import { createClient } from "@/lib/supabase/server";

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
