"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RefreshResponse = {
  ok?: boolean;
  error?: string;
  success_count?: number;
  failure_count?: number;
  tenants?: Array<{ ok: boolean; tenant_name: string; error?: string }>;
};

export function RefreshStorageStatsButton({ endpointUrl }: { endpointUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        redirect: "manual",
      });
      if (response.type === "opaqueredirect") {
        throw new Error("Please sign in as the platform owner.");
      }
      const body = (await response.json().catch(() => null)) as RefreshResponse | null;
      if (!response.ok && !body?.success_count) {
        throw new Error(body?.error ?? `Refresh failed (${response.status})`);
      }
      const failures = body?.failure_count ?? 0;
      const successes = body?.success_count ?? 0;
      if (failures > 0) {
        const sample = (body?.tenants ?? [])
          .filter((item) => !item.ok)
          .slice(0, 3)
          .map((item) => `${item.tenant_name}: ${item.error ?? "failed"}`)
          .join("; ");
        setNotice(
          `Partial refresh: ${successes} ok, ${failures} failed${sample ? ` (${sample})` : ""}.`,
        );
      } else {
        setNotice(`Refreshed ${successes} tenant${successes === 1 ? "" : "s"}.`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Refreshing…" : "Refresh storage stats"}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {notice ? <p className="text-xs text-slate-600">{notice}</p> : null}
    </div>
  );
}
