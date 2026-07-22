import { NextResponse } from "next/server";
import { refreshTenantStorageStats } from "@/lib/admin-storage-refresh";
import { getB2PrefixStats } from "@/lib/b2";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export const runtime = "nodejs";

function safeReturnTo(value: string | null): string {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("/admin/usage")) return raw;
  return "/admin/usage";
}

export async function POST(request: Request) {
  const { admin } = await requirePlatformAdmin();
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));

  const { data: tenants, error: tenantsError } = await admin
    .from("tenants")
    .select("id, name")
    .order("name", { ascending: true });

  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }

  const summary = await refreshTenantStorageStats({
    tenants: (tenants ?? []).map((tenant) => ({ id: tenant.id, name: tenant.name })),
    concurrency: 5,
    getPrefixStats: getB2PrefixStats,
    upsertStats: async (row) => {
      const { error } = await admin.from("tenant_storage_stats").upsert(row);
      if (error) throw new Error(error.message);
    },
  });

  return NextResponse.json(
    {
      ...summary,
      return_to: returnTo,
    },
    { status: summary.failure_count > 0 && summary.success_count === 0 ? 500 : 200 },
  );
}
