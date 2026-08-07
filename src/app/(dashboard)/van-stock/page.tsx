import Link from "next/link";
import { getVehicles } from "@/actions/vehicles";

export default async function VanStockIndexPage() {
  const { data: vehicles, error } = await getVehicles();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  const list = vehicles ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Van Stock</h1>
      <p className="mt-1 text-sm text-slate-600">
        Pick a van to check its stock or allocate items from the store room.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Van
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Make / model
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                  No vans yet —{" "}
                  <Link href="/vans/new" className="underline">
                    add one
                  </Link>{" "}
                  first.
                </td>
              </tr>
            ) : (
              list.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/van-stock/${v.id}`} className="hover:underline">
                      {v.registration}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {v.make_model ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
