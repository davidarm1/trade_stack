"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshStorageStatsButton({ endpointUrl }: { endpointUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
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
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Refresh failed (${response.status})`);
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
    </div>
  );
}
