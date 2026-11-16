"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startSupportSession } from "@/actions/support";

export function OpenSupportForm({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("view");
  const [minutes, setMinutes] = useState("60");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (mode === "full" && !window.confirm(`Full access lets you change ${tenantName}'s real data. Continue?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await startSupportSession({
      tenantId,
      mode,
      minutes: Number(minutes),
      reason,
    });
    if (res.error) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        Open as support
      </button>
    );
  }

  return (
    <div className="w-80 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-left">
      <label className="block text-xs font-medium text-slate-700">
        Access
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="view">View only (safe — can&apos;t change data)</option>
          <option value="full">Full access (owner — can change data)</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-700">
        Duration
        <select
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="240">4 hours (maximum)</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-700">
        Reason (logged)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ticket / what the client reported"
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Opening…" : "Start session"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
