"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { recordVanStockCheck } from "@/actions/van-stock";
import type { VanStockRow } from "@/actions/van-stock";

export function StockCheckRow({ row }: { row: VanStockRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.quantity));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setPending(true);
    setError(null);
    const { error: err } = await recordVanStockCheck({
      vanStockId: row.id,
      countedQuantity: Number(value),
    });
    setPending(false);
    if (err) {
      setError(err);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-900">
          {row.stock_item?.name ?? "Unknown item"}
        </span>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="tabular-nums text-slate-700 hover:underline"
          >
            {row.quantity}
            {row.stock_item?.unit ? ` ${row.stock_item.unit}` : ""}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Last checked:{" "}
        {row.last_checked_at
          ? new Date(row.last_checked_at).toLocaleString()
          : "never"}
      </p>
    </div>
  );
}
