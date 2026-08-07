"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createStockItem } from "@/actions/stock";

export function NewStockItemForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const { data, error: err } = await createStockItem({
      name: String(form.get("name") ?? ""),
      sku: String(form.get("sku") ?? "") || null,
      unit: String(form.get("unit") ?? "") || null,
      reorder_threshold: form.get("reorder_threshold")
        ? Number(form.get("reorder_threshold"))
        : null,
      notes: String(form.get("notes") ?? "") || null,
      is_active: true,
    });

    setPending(false);
    if (err || !data) {
      setError(err ?? "Could not create stock item");
      return;
    }
    router.push(`/store-room/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Name</label>
        <input
          name="name"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">SKU</label>
          <input
            name="sku"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Unit</label>
          <input
            name="unit"
            placeholder="e.g. box, metre, each"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Reorder threshold
        </label>
        <input
          name="reorder_threshold"
          type="number"
          min="0"
          step="any"
          className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">
          Flagged as low stock at or below this quantity.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Notes</label>
        <textarea
          name="notes"
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
        {pending ? "Saving…" : "Create stock item"}
      </button>
    </form>
  );
}
