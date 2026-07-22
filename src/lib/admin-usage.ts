import { londonMonthBounds, londonPartsOf } from "@/lib/metrics/period-totals";
import {
  AI_USAGE_GROUPS,
  aiUsageMonthTotalUsd,
  emptyAiUsageSummary,
  summarizeAiUsageRows,
  type AiUsageCostRow,
  type AiUsageSummary,
} from "@/lib/ai-usage-metrics";

export const STORAGE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type AdminUsageSortKey = "name" | "ai" | "storage";
export type AdminUsageSortDir = "asc" | "desc";
export type AdminActiveFilter = "all" | "active" | "inactive";

export type AdminUsageQuery = {
  month: string;
  q: string;
  active: AdminActiveFilter;
  plan: string;
  sort: AdminUsageSortKey;
  dir: AdminUsageSortDir;
  page: number;
  pageSize: number;
};

export type AdminTenantUsageInput = {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  is_active: boolean;
};

export type AdminTenantUsageRow = {
  tenant: AdminTenantUsageInput;
  aiSummary: AiUsageSummary;
  aiMonthTotalUsd: number;
  storage: {
    totalBytes: number | null;
    objectCount: number | null;
    computedAt: string | null;
    stale: boolean;
  };
};

export function humanBytes(totalBytes: number | null): string {
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

export function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value;
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function buildMonthOptions(now: Date, count = 12): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const parts = londonPartsOf(now);
  for (let index = 0; index < count; index += 1) {
    let year = parts.year;
    let month = parts.month - index;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    const value = `${year}-${String(month).padStart(2, "0")}`;
    options.push({ value, label: formatMonthLabel(value) });
  }
  return options;
}

export function monthBoundsFromValue(
  monthValue: string,
  now: Date,
): { startIso: string; endIso: string; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) {
    const current = londonPartsOf(now);
    const bounds = londonMonthBounds(current.year, current.month);
    return {
      startIso: bounds.start.toISOString(),
      endIso: bounds.end.toISOString(),
      label: `${current.year}-${String(current.month).padStart(2, "0")}`,
    };
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const bounds = londonMonthBounds(year, month);
  return { startIso: bounds.start.toISOString(), endIso: bounds.end.toISOString(), label: monthValue };
}

export function isStorageStale(computedAt: string | null, now = new Date()): boolean {
  if (!computedAt) return true;
  const ts = Date.parse(computedAt);
  if (!Number.isFinite(ts)) return true;
  return now.getTime() - ts > STORAGE_STALE_AFTER_MS;
}

export function parseAdminUsageQuery(
  params: Record<string, string | string[] | undefined>,
  now = new Date(),
): AdminUsageQuery {
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  };

  const currentMonth = `${londonPartsOf(now).year}-${String(londonPartsOf(now).month).padStart(2, "0")}`;
  const monthRaw = single("month");
  const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : currentMonth;

  const activeRaw = single("active");
  const active: AdminActiveFilter =
    activeRaw === "active" || activeRaw === "inactive" ? activeRaw : "all";

  const sortRaw = single("sort");
  const sort: AdminUsageSortKey =
    sortRaw === "ai" || sortRaw === "storage" || sortRaw === "name" ? sortRaw : "name";

  const dirRaw = single("dir");
  const dir: AdminUsageSortDir = dirRaw === "desc" ? "desc" : "asc";

  const pageRaw = Number.parseInt(single("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const pageSizeRaw = Number.parseInt(single("pageSize") ?? "25", 10);
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 100) : 25;

  return {
    month,
    q: (single("q") ?? "").trim(),
    active,
    plan: (single("plan") ?? "").trim(),
    sort,
    dir,
    page,
    pageSize,
  };
}

export function buildTenantUsageRows(args: {
  tenants: AdminTenantUsageInput[];
  usageRows: Array<AiUsageCostRow & { tenant_id: string }>;
  storageRows: Array<{
    tenant_id: string;
    total_bytes: number | null;
    object_count: number | null;
    computed_at: string | null;
  }>;
  now?: Date;
}): AdminTenantUsageRow[] {
  const now = args.now ?? new Date();
  const storageByTenant = new Map(args.storageRows.map((row) => [row.tenant_id, row]));
  const usageByTenant = new Map<string, AiUsageCostRow[]>();
  for (const row of args.usageRows) {
    const list = usageByTenant.get(row.tenant_id) ?? [];
    list.push(row);
    usageByTenant.set(row.tenant_id, list);
  }

  return args.tenants.map((tenant) => {
    const summary = summarizeAiUsageRows(usageByTenant.get(tenant.id) ?? []);
    const storage = storageByTenant.get(tenant.id);
    const computedAt = storage?.computed_at ?? null;
    return {
      tenant,
      aiSummary: summary,
      aiMonthTotalUsd: aiUsageMonthTotalUsd(summary),
      storage: {
        totalBytes: storage?.total_bytes ?? null,
        objectCount: storage?.object_count ?? null,
        computedAt,
        stale: isStorageStale(computedAt, now),
      },
    };
  });
}

export function filterSortPaginateTenantUsage(
  rows: AdminTenantUsageRow[],
  query: AdminUsageQuery,
): {
  rows: AdminTenantUsageRow[];
  totalMatching: number;
  totalPages: number;
  visibleAiUsd: number;
  visibleStorageBytes: number;
  plans: string[];
} {
  const q = query.q.toLowerCase();
  let filtered = rows.filter((row) => {
    if (query.active === "active" && !row.tenant.is_active) return false;
    if (query.active === "inactive" && row.tenant.is_active) return false;
    if (query.plan && (row.tenant.plan ?? "") !== query.plan) return false;
    if (!q) return true;
    const haystack = `${row.tenant.name} ${row.tenant.slug} ${row.tenant.plan ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });

  const factor = query.dir === "desc" ? -1 : 1;
  filtered = [...filtered].sort((a, b) => {
    if (query.sort === "ai") {
      return (a.aiMonthTotalUsd - b.aiMonthTotalUsd) * factor;
    }
    if (query.sort === "storage") {
      const aBytes = a.storage.totalBytes ?? -1;
      const bBytes = b.storage.totalBytes ?? -1;
      return (aBytes - bBytes) * factor;
    }
    return a.tenant.name.localeCompare(b.tenant.name) * factor;
  });

  const totalMatching = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalMatching / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.pageSize;
  const pageRows = filtered.slice(start, start + query.pageSize);

  const visibleAiUsd = pageRows.reduce((sum, row) => sum + row.aiMonthTotalUsd, 0);
  const visibleStorageBytes = pageRows.reduce(
    (sum, row) => sum + (row.storage.totalBytes ?? 0),
    0,
  );

  const plans = [
    ...new Set(
      rows
        .map((row) => row.tenant.plan)
        .filter((plan): plan is string => Boolean(plan && plan.trim())),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return {
    rows: pageRows,
    totalMatching,
    totalPages,
    visibleAiUsd,
    visibleStorageBytes,
    plans,
  };
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

export { AI_USAGE_GROUPS, emptyAiUsageSummary };
