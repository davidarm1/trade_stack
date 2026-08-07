import { notFound } from "next/navigation";
import { getStockItem, getStockMovements } from "@/actions/stock";
import { StockMovementForm } from "./stock-movement-form";

export default async function StockItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: item, error }, { data: movements }] = await Promise.all([
    getStockItem(id),
    getStockMovements(id),
  ]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }
  if (!item) return notFound();

  const low =
    item.reorder_threshold != null && item.current_qty <= item.reorder_threshold;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{item.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {item.sku ? `SKU ${item.sku} · ` : ""}
            {item.current_qty}
            {item.unit ? ` ${item.unit}` : ""} in stock
          </p>
        </div>
        {low && (
          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Low stock — reorder threshold {item.reorder_threshold}
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <StockMovementForm stockItemId={item.id} currentQty={item.current_qty} />

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent movements
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(movements ?? []).length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                No movements yet.
              </p>
            ) : (
              (movements ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div>
                    <span
                      className={
                        m.direction === "in"
                          ? "font-medium text-emerald-700"
                          : "font-medium text-slate-900"
                      }
                    >
                      {m.direction === "in" ? "Booked in" : "Booked out"}
                    </span>
                    <span className="ml-2 tabular-nums text-slate-700">
                      {m.quantity}
                    </span>
                    {m.notes ? (
                      <p className="text-xs text-slate-500">{m.notes}</p>
                    ) : null}
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(m.moved_at).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
