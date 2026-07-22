import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  AI_USAGE_GROUPS,
  buildMonthOptions,
  buildTenantUsageRows,
  filterSortPaginateTenantUsage,
  formatMonthLabel,
  formatUsd,
  humanBytes,
  monthBoundsFromValue,
  parseAdminUsageQuery,
  type AdminUsageSortDir,
  type AdminUsageSortKey,
} from "@/lib/admin-usage";
import type { Tenant } from "@/types/database";
import { RefreshStorageStatsButton } from "./refresh-storage-stats-button";

type AiUsageRow = {
  tenant_id: string;
  feature: string;
  cost_usd: number | null;
};

type TenantStorageStatsRow = {
  tenant_id: string;
  total_bytes: number | null;
  object_count: number | null;
  computed_at: string | null;
};

function sortHref(
  base: Record<string, string>,
  key: AdminUsageSortKey,
  currentSort: AdminUsageSortKey,
  currentDir: AdminUsageSortDir,
): string {
  const nextDir: AdminUsageSortDir =
    currentSort === key && currentDir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams({ ...base, sort: key, dir: nextDir, page: "1" });
  return `/admin/usage?${params.toString()}`;
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { admin } = await requirePlatformAdmin();
  const now = new Date();
  const resolvedParams = searchParams ? await searchParams : {};
  const query = parseAdminUsageQuery(resolvedParams, now);
  const { startIso, endIso } = monthBoundsFromValue(query.month, now);

  const [tenantsResult, aiUsageResult, storageResult] = await Promise.all([
    admin
      .from("tenants")
      .select(
        "id, name, slug, plan, is_active, created_at, updated_at, vat_number, company_reg_number, address1, address2, town, postcode, phone, email, logo_url, default_vat_rate, default_payment_terms_days, currency, invoice_footer_text",
      )
      .order("name", { ascending: true }),
    admin
      .from("ai_usage")
      .select("tenant_id, feature, cost_usd")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    admin
      .from("tenant_storage_stats")
      .select("tenant_id, total_bytes, object_count, computed_at"),
  ]);

  if (tenantsResult.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {tenantsResult.error.message}
      </div>
    );
  }
  if (aiUsageResult.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {aiUsageResult.error.message}
      </div>
    );
  }
  if (storageResult.error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {storageResult.error.message}
      </div>
    );
  }

  const tenants = (tenantsResult.data ?? []) as Tenant[];
  const allRows = buildTenantUsageRows({
    tenants,
    usageRows: (aiUsageResult.data ?? []) as AiUsageRow[],
    storageRows: (storageResult.data ?? []) as TenantStorageStatsRow[],
    now,
  });
  const filtered = filterSortPaginateTenantUsage(allRows, query);
  const monthOptions = buildMonthOptions(now, 12);

  const formDefaults: Record<string, string> = {
    month: query.month,
    q: query.q,
    active: query.active,
    plan: query.plan,
    sort: query.sort,
    dir: query.dir,
    pageSize: String(query.pageSize),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Usage</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Tenant AI cost and storage</h2>
          <p className="mt-1 text-sm text-slate-600">Platform-owner view only. Costs are USD from OpenAI.</p>
        </div>
        <RefreshStorageStatsButton endpointUrl="/api/admin/refresh-storage-stats" />
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6"
      >
        <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
          <span>Search</span>
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Company name or slug"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Month</span>
          <select
            name="month"
            defaultValue={query.month}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Status</span>
          <select
            name="active"
            defaultValue={query.active}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Plan</span>
          <select
            name="plan"
            defaultValue={query.plan}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
          >
            <option value="">All plans</option>
            {filtered.plans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <input type="hidden" name="sort" value={query.sort} />
          <input type="hidden" name="dir" value={query.dir} />
          <input type="hidden" name="page" value="1" />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Visible tenants</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {filtered.rows.length}
            <span className="ml-1 text-sm font-normal text-slate-500">/ {filtered.totalMatching}</span>
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
            AI total ({formatMonthLabel(query.month)})
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {formatUsd(filtered.visibleAiUsd)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Storage (visible)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {humanBytes(filtered.visibleStorageBytes)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">
                <Link href={sortHref(formDefaults, "name", query.sort, query.dir)} className="hover:text-slate-800">
                  Tenant {query.sort === "name" ? (query.dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              <th className="px-4 py-3">AI usage ({formatMonthLabel(query.month)})</th>
              <th className="px-4 py-3">
                <Link href={sortHref(formDefaults, "ai", query.sort, query.dir)} className="hover:text-slate-800">
                  Month total {query.sort === "ai" ? (query.dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link
                  href={sortHref(formDefaults, "storage", query.sort, query.dir)}
                  className="hover:text-slate-800"
                >
                  Storage {query.sort === "storage" ? (query.dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.rows.map((row) => (
              <tr key={row.tenant.id} className="align-top">
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <Link
                      href={`/admin/usage/${row.tenant.id}?month=${encodeURIComponent(query.month)}`}
                      className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                    >
                      {row.tenant.name}
                    </Link>
                    <div className="text-xs text-slate-500">Plan: {row.tenant.plan ?? "—"}</div>
                    <div
                      className={
                        row.tenant.is_active
                          ? "text-xs font-medium text-emerald-700"
                          : "text-xs font-medium text-red-700"
                      }
                    >
                      {row.tenant.is_active ? "Active" : "Inactive"}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-2 text-sm text-slate-700">
                    {AI_USAGE_GROUPS.map((group) => {
                      const groupSummary = row.aiSummary[group.key];
                      const pct =
                        groupSummary.monthlySoftCapUsd > 0
                          ? Math.round((groupSummary.costUsd / groupSummary.monthlySoftCapUsd) * 100)
                          : 0;
                      return (
                        <div key={group.key} className="rounded-md bg-slate-50 px-3 py-2">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-medium text-slate-900">{group.label}</span>
                            <span className="tabular-nums text-slate-600">
                              {groupSummary.calls} calls • {formatUsd(groupSummary.costUsd)} • {pct}% of
                              cap
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-4 tabular-nums text-slate-900">
                  {formatUsd(row.aiMonthTotalUsd)}
                </td>
                <td className="px-4 py-4 text-sm text-slate-700">
                  <div>{humanBytes(row.storage.totalBytes)}</div>
                  <div>Objects: {row.storage.objectCount ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    Computed:{" "}
                    {row.storage.computedAt
                      ? new Date(row.storage.computedAt).toLocaleString("en-GB")
                      : "never"}
                  </div>
                  {row.storage.stale ? (
                    <div className="mt-1 text-xs font-medium text-amber-700">Stale (&gt;24h or never)</div>
                  ) : (
                    <div className="mt-1 text-xs font-medium text-emerald-700">Fresh</div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                  No tenants match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {filtered.totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>
            Page {Math.min(query.page, filtered.totalPages)} of {filtered.totalPages}
          </span>
          {query.page > 1 ? (
            <Link
              className="underline underline-offset-2"
              href={`/admin/usage?${new URLSearchParams({ ...formDefaults, page: String(query.page - 1) }).toString()}`}
            >
              Previous
            </Link>
          ) : null}
          {query.page < filtered.totalPages ? (
            <Link
              className="underline underline-offset-2"
              href={`/admin/usage?${new URLSearchParams({ ...formDefaults, page: String(query.page + 1) }).toString()}`}
            >
              Next
            </Link>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-slate-500">
        Storage stats are refreshed on demand and are point-in-time; AI usage follows the selected month.
        Cross-tenant reads use the service-role client after platform-admin checks only.
      </p>
      <Link href="/admin" className="text-sm font-medium text-slate-700 underline underline-offset-4">
        Back to admin home
      </Link>
    </div>
  );
}
