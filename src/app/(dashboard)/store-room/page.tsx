import Link from "next/link";
import { getStockItems } from "@/actions/stock";

export default async function StoreRoomPage() {
  const { data: items, error } = await getStockItems();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  const list = items ?? [];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Store Room</h1>
          <p className="mt-1 text-sm text-slate-600">
            Stock levels, booking in/out, and reorder alerts.
          </p>
        </div>
        <Link
          href="/store-room/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New stock item
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Item</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">SKU</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Qty</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Reorder at</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No stock items yet. Add one to get started.
                </td>
              </tr>
            ) : (
              list.map((item) => {
                const low =
                  item.reorder_threshold != null &&
                  item.current_qty <= item.reorder_threshold;
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link href={`/store-room/${item.id}`} className="hover:underline">
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.sku ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {item.current_qty}
                      {item.unit ? ` ${item.unit}` : ""}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {item.reorder_threshold ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {low ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Low stock
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
