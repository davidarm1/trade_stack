export type StorageRefreshTenant = {
  id: string;
  name: string;
};

export type StorageRefreshSuccess = {
  ok: true;
  tenant_id: string;
  tenant_name: string;
  object_count: number;
  total_bytes: number;
  computed_at: string;
};

export type StorageRefreshFailure = {
  ok: false;
  tenant_id: string;
  tenant_name: string;
  error: string;
};

export type StorageRefreshItem = StorageRefreshSuccess | StorageRefreshFailure;

export type StorageRefreshSummary = {
  ok: boolean;
  duration_ms: number;
  tenant_count: number;
  success_count: number;
  failure_count: number;
  tenants: StorageRefreshItem[];
};

/**
 * Refresh B2 prefix stats per tenant with bounded concurrency.
 * One tenant failure never aborts the rest.
 */
export async function refreshTenantStorageStats(args: {
  tenants: StorageRefreshTenant[];
  getPrefixStats: (prefix: string) => Promise<{ objectCount: number; totalBytes: number }>;
  upsertStats: (row: {
    tenant_id: string;
    total_bytes: number;
    object_count: number;
    computed_at: string;
  }) => Promise<void>;
  concurrency?: number;
  now?: () => Date;
}): Promise<StorageRefreshSummary> {
  const start = Date.now();
  const concurrency = Math.max(1, Math.min(args.concurrency ?? 5, 20));
  const now = args.now ?? (() => new Date());
  const results: StorageRefreshItem[] = new Array(args.tenants.length);

  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= args.tenants.length) return;
      const tenant = args.tenants[index];
      try {
        const prefix = `tradestack/${tenant.id}/`;
        const stats = await args.getPrefixStats(prefix);
        const computedAt = now().toISOString();
        await args.upsertStats({
          tenant_id: tenant.id,
          total_bytes: stats.totalBytes,
          object_count: stats.objectCount,
          computed_at: computedAt,
        });
        results[index] = {
          ok: true,
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          object_count: stats.objectCount,
          total_bytes: stats.totalBytes,
          computed_at: computedAt,
        };
      } catch (err) {
        results[index] = {
          ok: false,
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          error: err instanceof Error ? err.message : "Storage refresh failed",
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, args.tenants.length || 1) }, () =>
    worker(),
  );
  await Promise.all(workers);

  const tenants = results.filter(Boolean);
  const success_count = tenants.filter((item) => item.ok).length;
  const failure_count = tenants.length - success_count;

  return {
    ok: failure_count === 0,
    duration_ms: Date.now() - start,
    tenant_count: tenants.length,
    success_count,
    failure_count,
    tenants,
  };
}
