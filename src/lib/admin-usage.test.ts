import { describe, expect, it } from "vitest";
import {
  buildTenantUsageRows,
  filterSortPaginateTenantUsage,
  isStorageStale,
  parseAdminUsageQuery,
} from "./admin-usage";
import { refreshTenantStorageStats } from "./admin-storage-refresh";

describe("admin usage query/aggregation", () => {
  it("parses filters with defaults", () => {
    const query = parseAdminUsageQuery(
      { month: "2026-07", q: " acme ", active: "active", plan: "pro", sort: "ai", dir: "desc" },
      new Date("2026-07-21T12:00:00Z"),
    );
    expect(query).toMatchObject({
      month: "2026-07",
      q: "acme",
      active: "active",
      plan: "pro",
      sort: "ai",
      dir: "desc",
      page: 1,
    });
  });

  it("marks storage stale after 24h or when never computed", () => {
    const now = new Date("2026-07-21T12:00:00Z");
    expect(isStorageStale(null, now)).toBe(true);
    expect(isStorageStale("2026-07-21T10:00:00Z", now)).toBe(false);
    expect(isStorageStale("2026-07-19T12:00:00Z", now)).toBe(true);
  });

  it("builds and filters tenant rows using cost_usd", () => {
    const rows = buildTenantUsageRows({
      now: new Date("2026-07-21T12:00:00Z"),
      tenants: [
        { id: "t1", name: "Alpha", slug: "alpha", plan: "pro", is_active: true },
        { id: "t2", name: "Beta", slug: "beta", plan: "free", is_active: false },
      ],
      usageRows: [
        { tenant_id: "t1", feature: "quote_price", cost_usd: 1.25 },
        { tenant_id: "t2", feature: "receipt_scan", cost_usd: 0.5 },
      ],
      storageRows: [
        {
          tenant_id: "t1",
          total_bytes: 2048,
          object_count: 2,
          computed_at: "2026-07-21T11:00:00Z",
        },
      ],
    });

    expect(rows[0].aiMonthTotalUsd).toBeCloseTo(1.25);
    expect(rows[0].storage.stale).toBe(false);
    expect(rows[1].storage.stale).toBe(true);

    const filtered = filterSortPaginateTenantUsage(rows, {
      month: "2026-07",
      q: "alp",
      active: "active",
      plan: "pro",
      sort: "ai",
      dir: "desc",
      page: 1,
      pageSize: 25,
    });
    expect(filtered.totalMatching).toBe(1);
    expect(filtered.rows[0].tenant.id).toBe("t1");
    expect(filtered.visibleAiUsd).toBeCloseTo(1.25);
  });
});

describe("refreshTenantStorageStats", () => {
  it("isolates per-tenant failures and continues", async () => {
    const summary = await refreshTenantStorageStats({
      tenants: [
        { id: "ok", name: "Ok Co" },
        { id: "bad", name: "Bad Co" },
        { id: "ok2", name: "Ok Two" },
      ],
      concurrency: 2,
      getPrefixStats: async (prefix) => {
        if (prefix.includes("bad")) throw new Error("b2 down");
        return { objectCount: 1, totalBytes: 10 };
      },
      upsertStats: async () => undefined,
    });

    expect(summary.success_count).toBe(2);
    expect(summary.failure_count).toBe(1);
    expect(summary.ok).toBe(false);
    expect(summary.tenants.find((row) => row.tenant_id === "bad")).toMatchObject({
      ok: false,
      error: "b2 down",
    });
  });
});
