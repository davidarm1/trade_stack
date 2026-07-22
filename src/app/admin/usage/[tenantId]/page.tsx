import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AI_USAGE_GROUPS,
  formatMonthLabel,
  formatUsd,
  humanBytes,
  isStorageStale,
  monthBoundsFromValue,
  parseAdminUsageQuery,
} from "@/lib/admin-usage";
import {
  aiUsageMonthTotalUsd,
  summarizeAiUsageRows,
} from "@/lib/ai-usage-metrics";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import type { Tenant } from "@/types/database";

export default async function AdminTenantUsageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { admin } = await requirePlatformAdmin();
  const { tenantId } = await params;
  const now = new Date();
  const resolvedParams = searchParams ? await searchParams : {};
  const query = parseAdminUsageQuery(resolvedParams, now);
  const { startIso, endIso } = monthBoundsFromValue(query.month, now);

  const [tenantResult, aiUsageResult, storageResult, historyResult] = await Promise.all([
    admin
      .from("tenants")
      .select("id, name, slug, plan, is_active, created_at")
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("ai_usage")
      .select("feature, cost_usd, model, prompt_tokens, completion_tokens, total_tokens, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("tenant_storage_stats")
      .select("total_bytes, object_count, computed_at")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    admin
      .from("ai_usage")
      .select("created_at, feature, cost_usd")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (tenantResult.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {tenantResult.error.message}
      </div>
    );
  }
  if (!tenantResult.data) notFound();

  const tenant = tenantResult.data as Pick<
    Tenant,
    "id" | "name" | "slug" | "plan" | "is_active" | "created_at"
  >;
  const monthRows = aiUsageResult.data ?? [];
  const summary = summarizeAiUsageRows(monthRows);
  const monthTotal = aiUsageMonthTotalUsd(summary);
  const storage = storageResult.data;
  const stale = isStorageStale(storage?.computed_at ?? null, now);

  const historyByMonth = new Map<string, { calls: number; costUsd: number }>();
  for (const row of historyResult.data ?? []) {
    const created = new Date(row.created_at);
    const key = `${created.getUTCFullYear()}-${String(created.getUTCMonth() + 1).padStart(2, "0")}`;
    // Prefer London month via ISO bounds would be better, but UTC month buckets are fine for history.
    const bucket = historyByMonth.get(key) ?? { calls: 0, costUsd: 0 };
    bucket.calls += 1;
    const cost = typeof row.cost_usd === "number" ? row.cost_usd : Number(row.cost_usd ?? 0);
    bucket.costUsd += Number.isFinite(cost) ? cost : 0;
    historyByMonth.set(key, bucket);
  }
  const history = [...historyByMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tenant</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{tenant.name}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {tenant.slug} · Plan {tenant.plan ?? "—"} ·{" "}
          {tenant.is_active ? "Active" : "Inactive"}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Showing AI usage for {formatMonthLabel(query.month)}. Raw file contents are never loaded here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Month AI total</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatUsd(monthTotal)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Storage</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {humanBytes(storage?.total_bytes ?? null)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {storage?.object_count ?? "—"} objects ·{" "}
            {stale ? "Stale" : "Fresh"} ·{" "}
            {storage?.computed_at
              ? new Date(storage.computed_at).toLocaleString("en-GB")
              : "never"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Calls this month</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{monthRows.length}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {AI_USAGE_GROUPS.map((group) => {
          const groupSummary = summary[group.key];
          return (
            <div key={group.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{group.label}</p>
              <p className="mt-2 tabular-nums text-slate-700">
                {groupSummary.calls} calls · {formatUsd(groupSummary.costUsd)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Feature</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Tokens</th>
              <th className="px-4 py-3">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {monthRows.map((row, index) => (
              <tr key={`${row.created_at}-${index}`}>
                <td className="px-4 py-3 text-slate-600">
                  {new Date(row.created_at).toLocaleString("en-GB")}
                </td>
                <td className="px-4 py-3">{row.feature}</td>
                <td className="px-4 py-3">{row.model ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums text-slate-600">
                  {row.prompt_tokens ?? 0} / {row.completion_tokens ?? 0} / {row.total_tokens ?? "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatUsd(typeof row.cost_usd === "number" ? row.cost_usd : Number(row.cost_usd ?? 0))}
                </td>
              </tr>
            ))}
            {monthRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                  No AI usage in this month.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Recent monthly history</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {history.map(([month, bucket]) => (
            <li key={month} className="flex justify-between gap-3">
              <span>{formatMonthLabel(month)}</span>
              <span className="tabular-nums">
                {bucket.calls} calls · {formatUsd(bucket.costUsd)}
              </span>
            </li>
          ))}
          {history.length === 0 ? <li className="text-slate-500">No historical AI usage yet.</li> : null}
        </ul>
      </div>

      <Link
        href={`/admin/usage?month=${encodeURIComponent(query.month)}`}
        className="text-sm font-medium text-slate-700 underline underline-offset-4"
      >
        Back to usage list
      </Link>
    </div>
  );
}
