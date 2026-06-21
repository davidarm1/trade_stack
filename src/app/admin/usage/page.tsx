import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { londonMonthBounds, londonPartsOf } from "@/lib/metrics/period-totals";
import { formatCurrency } from "@/lib/format-currency";
import { AI_USAGE_GROUPS, emptyAiUsageSummary, summarizeAiUsageRows } from "@/lib/ai-usage-metrics";
import type { Tenant } from "@/types/database";
import { RefreshStorageStatsButton } from "./refresh-storage-stats-button";

type MonthOption = {
  value: string;
  label: string;
};

type TenantStorageStatsRow = {
  tenant_id: string;
  total_bytes: number | null;
  object_count: number | null;
  computed_at: string | null;
};

type AiUsageRow = {
  tenant_id: string;
  feature: string;
  cost_pence: number | null;
};

type TenantUsageRow = {
  tenant: Tenant;
  aiSummary: ReturnType<typeof emptyAiUsageSummary>;
  aiMonthTotalPence: number;
  storage: {
    totalBytes: number | null;
    objectCount: number | null;
    computedAt: string | null;
  };
};

function humanBytes(totalBytes: number | null): string {
  if (totalBytes == null || !Number.isFinite(totalBytes)) return "—";
  const abs = Math.abs(totalBytes);
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let unitIndex = 0;
  let value = abs;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${totalBytes < 0 ? "-" : ""}${formatted} ${units[unitIndex]}`;
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value;
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(year, month - 1, 1));
}

function buildMonthOptions(now: Date, count = 12): MonthOption[] {
  const options: MonthOption[] = [];
  const parts = londonPartsOf(now);
  for (let index = 0; index < count; index += 1) {
    const year = parts.year;
    const month = parts.month - index;
    const d = new Date(year, month - 1, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: formatMonthLabel(value) });
  }
  return options;
}

function monthBoundsFromValue(monthValue: string, now: Date): { startIso: string; endIso: string; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) {
    const current = londonPartsOf(now);
    const bounds = londonMonthBounds(current.year, current.month);
    return { startIso: bounds.start.toISOString(), endIso: bounds.end.toISOString(), label: `${current.year}-${String(current.month).padStart(2, "0")}` };
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const bounds = londonMonthBounds(year, month);
  return { startIso: bounds.start.toISOString(), endIso: bounds.end.toISOString(), label: monthValue };
}

function aiMonthTotal(summary: ReturnType<typeof emptyAiUsageSummary>): number {
  return AI_USAGE_GROUPS.reduce((sum, group) => sum + summary[group.key].costPence, 0);
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const { admin } = await requirePlatformAdmin();
  const now = new Date();
  const resolvedParams = searchParams ? await searchParams : {};
  const selectedMonth = typeof resolvedParams.month === "string" && /^\d{4}-\d{2}$/.test(resolvedParams.month)
    ? resolvedParams.month
    : `${londonPartsOf(now).year}-${String(londonPartsOf(now).month).padStart(2, "0")}`;
  const { startIso, endIso } = monthBoundsFromValue(selectedMonth, now);

  const [tenantsResult, aiUsageResult, storageResult] = await Promise.all([
    admin.from("tenants").select("id, name, slug, plan, is_active, created_at, updated_at, vat_number, company_reg_number, address1, address2, town, postcode, phone, email, logo_url, default_vat_rate, default_payment_terms_days, currency, invoice_footer_text").order("name", { ascending: true }),
    admin
      .from("ai_usage")
      .select("tenant_id, feature, cost_pence")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    admin
      .from("tenant_storage_stats")
      .select("tenant_id, total_bytes, object_count, computed_at"),
  ]);

  if (tenantsResult.error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">{tenantsResult.error.message}</div>;
  }
  if (aiUsageResult.error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">{aiUsageResult.error.message}</div>;
  }
  if (storageResult.error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">{storageResult.error.message}</div>;
  }

  const tenants = (tenantsResult.data ?? []) as Tenant[];
  const usageRows = (aiUsageResult.data ?? []) as AiUsageRow[];
  const storageRows = (storageResult.data ?? []) as TenantStorageStatsRow[];
  const storageByTenant = new Map(storageRows.map((row) => [row.tenant_id, row]));
  const usageByTenant = new Map<string, AiUsageRow[]>();
  for (const row of usageRows) {
    const list = usageByTenant.get(row.tenant_id) ?? [];
    list.push(row);
    usageByTenant.set(row.tenant_id, list);
  }

  const rows: TenantUsageRow[] = tenants.map((tenant) => {
    const summary = summarizeAiUsageRows(usageByTenant.get(tenant.id) ?? []);
    const storage = storageByTenant.get(tenant.id);
    return {
      tenant,
      aiSummary: summary,
      aiMonthTotalPence: aiMonthTotal(summary),
      storage: {
        totalBytes: storage?.total_bytes ?? null,
        objectCount: storage?.object_count ?? null,
        computedAt: storage?.computed_at ?? null,
      },
    };
  });

  const monthOptions = buildMonthOptions(now, 12);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Usage</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Tenant AI cost and storage</h2>
          <p className="mt-1 text-sm text-slate-600">Platform-owner view only.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <form method="get" className="flex items-end gap-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Month</span>
              <select
                name="month"
                defaultValue={selectedMonth}
                className="block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
              View
            </button>
          </form>
          <RefreshStorageStatsButton endpointUrl="/api/admin/refresh-storage-stats" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Tenant</th>
              <th className="px-4 py-3">AI usage ({formatMonthLabel(selectedMonth)})</th>
              <th className="px-4 py-3">Month total</th>
              <th className="px-4 py-3">Storage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const total = row.aiMonthTotalPence / 100;
              return (
                <tr key={row.tenant.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900">{row.tenant.name}</div>
                      <div className="text-xs text-slate-500">Plan: {row.tenant.plan ?? "—"}</div>
                      <div className={row.tenant.is_active ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-red-700"}>
                        {row.tenant.is_active ? "Active" : "Inactive"}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2 text-sm text-slate-700">
                      {AI_USAGE_GROUPS.map((group) => {
                        const groupSummary = row.aiSummary[group.key];
                        const pct = groupSummary.monthlySoftCapPence > 0
                          ? Math.round((groupSummary.costPence / groupSummary.monthlySoftCapPence) * 100)
                          : 0;
                        return (
                          <div key={group.key} className="rounded-md bg-slate-50 px-3 py-2">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-medium text-slate-900">{group.label}</span>
                              <span className="tabular-nums text-slate-600">
                                {groupSummary.calls} calls • £{(groupSummary.costPence / 100).toFixed(2)} • {pct}% of cap
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-4 tabular-nums text-slate-900">{formatCurrency(total, "GBP")}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">
                    <div>{humanBytes(row.storage.totalBytes)}</div>
                    <div>Objects: {row.storage.objectCount ?? "—"}</div>
                    <div className="text-xs text-slate-500">Computed: {row.storage.computedAt ? new Date(row.storage.computedAt).toLocaleString("en-GB") : "never"}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-500">
        Storage stats are refreshed on demand and are point-in-time; AI usage follows the selected month.
      </p>
      <Link href="/admin" className="text-sm font-medium text-slate-700 underline underline-offset-4">Back to admin home</Link>
    </div>
  );
}
