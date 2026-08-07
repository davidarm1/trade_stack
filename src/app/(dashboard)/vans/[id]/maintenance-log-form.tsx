"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addMaintenanceLogEntry } from "@/actions/vehicles";

export function MaintenanceLogForm({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const { data, error: err } = await addMaintenanceLogEntry({
      vehicleId,
      loggedDate: String(form.get("logged_date") ?? "") || new Date().toISOString().slice(0, 10),
      description: String(form.get("description") ?? ""),
      cost: form.get("cost") ? Number(form.get("cost")) : null,
    });

    setPending(false);
    if (err || !data) {
      setError(err ?? "Could not add log entry");
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Log maintenance</h2>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Date
          </label>
          <input
            name="logged_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Description
          </label>
          <input
            name="description"
            required
            placeholder="e.g. Tyre replacement, service"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Cost
          </label>
          <input
            name="cost"
            type="number"
            min="0"
            step="0.01"
            className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add entry"}
        </button>
      </form>
    </div>
  );
}
