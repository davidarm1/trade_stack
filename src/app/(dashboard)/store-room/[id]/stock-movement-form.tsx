"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bookStockIn, bookStockOut } from "@/actions/stock";

export function StockMovementForm({
  stockItemId,
  currentQty,
}: {
  stockItemId: string;
  currentQty: number;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const quantity = Number(form.get("quantity") ?? 0);
    const notes = String(form.get("notes") ?? "") || null;

    const result =
      direction === "out"
        ? await bookStockOut({ stockItemId, quantity, notes })
        : await bookStockIn({ stockItemId, quantity, notes });

    setPending(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Could not record movement");
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Book stock</h2>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setDirection("out")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            direction === "out"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 text-slate-700"
          }`}
        >
          Book out
        </button>
        <button
          type="button"
          onClick={() => setDirection("in")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            direction === "in"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 text-slate-700"
          }`}
        >
          Book in
        </button>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Quantity
          </label>
          <input
            name="quantity"
            type="number"
            min="0.01"
            step="any"
            max={direction === "out" ? currentQty : undefined}
            required
            className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Notes
          </label>
          <input
            name="notes"
            placeholder={
              direction === "out" ? "Job / engineer / van" : "e.g. new delivery"
            }
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
          {pending ? "Saving…" : direction === "out" ? "Book out" : "Book in"}
        </button>
      </form>
    </div>
  );
}
