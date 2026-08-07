"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { allocateStockToVan } from "@/actions/van-stock";
import type { StockItem } from "@/types/database";

export function AllocateStockForm({
  vehicleId,
  storeItems,
}: {
  vehicleId: string;
  storeItems: StockItem[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const { error: err } = await allocateStockToVan({
      vehicleId,
      stockItemId: String(form.get("stock_item_id") ?? ""),
      quantity: Number(form.get("quantity") ?? 0),
    });

    setPending(false);
    if (err) {
      setError(err);
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        Allocate from store room
      </h2>
      {storeItems.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          No store-room items yet — add some on the Store Room page first.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Item
            </label>
            <select
              name="stock_item_id"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {storeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.current_qty}
                  {item.unit ? ` ${item.unit}` : ""} in store room)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Quantity
            </label>
            <input
              name="quantity"
              type="number"
              min="0.01"
              step="any"
              required
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
            {pending ? "Allocating…" : "Allocate to van"}
          </button>
        </form>
      )}
    </div>
  );
}
