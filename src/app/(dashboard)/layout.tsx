import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("name, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  let companyName: string | null = null;
  if (profile?.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    companyName = tenant?.name ?? null;
  }

  return (
    <DashboardShell
      companyName={companyName}
      userName={profile?.name ?? user.email ?? null}
    >
      {children}
    </DashboardShell>
  );
}
