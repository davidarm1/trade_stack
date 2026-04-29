import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  BRANDING_SHOW_COMPANY_NAME_KEY,
  BRANDING_SHOW_LOGO_KEY,
  BRANDING_USE_LOGO_LEGACY_KEY,
  resolveBrandingFromSettings,
} from "@/lib/branding-settings";
import type { UserRole } from "@/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("name, tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  let companyName: string | null = null;
  let logoUrl: string | null = null;
  let brandingShowLogo = false;
  let brandingShowCompanyName = true;
  if (profile?.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, logo_url")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    companyName = tenant?.name ?? null;
    logoUrl = tenant?.logo_url ?? null;
    const { data: brandingRows } = await supabase
      .from("settings")
      .select("field_key, field_value")
      .eq("tenant_id", profile.tenant_id)
      .in("field_key", [
        BRANDING_SHOW_LOGO_KEY,
        BRANDING_SHOW_COMPANY_NAME_KEY,
        BRANDING_USE_LOGO_LEGACY_KEY,
      ]);
    const brandingMap = Object.fromEntries(
      (brandingRows ?? []).map((r) => [String(r.field_key), String(r.field_value ?? "")]),
    );
    const resolved = resolveBrandingFromSettings(brandingMap);
    brandingShowLogo = resolved.showLogo;
    brandingShowCompanyName = resolved.showName;
  }

  const userRole = (profile?.role as UserRole | null) ?? null;

  return (
    <DashboardShell
      companyName={companyName}
      logoUrl={logoUrl}
      brandingShowLogo={brandingShowLogo}
      brandingShowCompanyName={brandingShowCompanyName}
      userName={profile?.name ?? user.email ?? null}
      userRole={userRole}
    >
      {children}
    </DashboardShell>
  );
}
