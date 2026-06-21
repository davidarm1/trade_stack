import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getB2PrefixStats } from "@/lib/b2";

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

  const start = Date.now();
  const { data: tenants, error: tenantsError } = await admin
    .from("tenants")
    .select("id, name")
    .order("name", { ascending: true });

  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }

  const results: Array<{
    tenant_id: string;
    tenant_name: string;
    object_count: number;
    total_bytes: number;
    computed_at: string;
  }> = [];

  for (const tenant of tenants ?? []) {
    const prefix = `tradestack/${tenant.id}/`;
    const stats = await getB2PrefixStats(prefix);
    const computedAt = new Date().toISOString();

    const { error: upsertError } = await admin.from("tenant_storage_stats").upsert({
      tenant_id: tenant.id,
      total_bytes: stats.totalBytes,
      object_count: stats.objectCount,
      computed_at: computedAt,
    });

    if (upsertError) {
      return NextResponse.json(
        {
          error: upsertError.message,
          tenant_id: tenant.id,
          tenant_name: tenant.name,
        },
        { status: 500 },
      );
    }

    results.push({
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      object_count: stats.objectCount,
      total_bytes: stats.totalBytes,
      computed_at: computedAt,
    });
  }

  const durationMs = Date.now() - start;
  return NextResponse.json(
    {
      ok: true,
      duration_ms: durationMs,
      tenant_count: results.length,
      return_to: returnTo,
      tenants: results,
    },
    { status: 200 },
  );
}
