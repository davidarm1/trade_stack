import Link from "next/link";
import { getVehicles } from "@/actions/vehicles";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function renewalBadge(label: string, dateStr: string | null) {
  const days = daysUntil(dateStr);
  if (days == null) {
    return <span className="text-slate-500">{label}: —</span>;
  }
  const soon = days <= 30;
  const overdue = days < 0;
  return (
    <span
      className={
        overdue
          ? "font-medium text-red-700"
          : soon
            ? "font-medium text-amber-700"
            : "text-slate-700"
      }
    >
      {label}: {new Date(dateStr!).toLocaleDateString()}
      {overdue ? " (overdue)" : soon ? ` (${days}d)` : ""}
    </span>
  );
}

export default async function VansPage() {
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Vans</h1>
          <p className="mt-1 text-sm text-slate-600">
            Fleet, MOT and insurance renewals, and maintenance history.
          </p>
        </div>
        <Link
          href="/vans/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New vehicle
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Registration
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Make / model
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                MOT
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Insurance
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No vehicles yet. Add one to get started.
                </td>
              </tr>
            ) : (
              list.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/vans/${v.id}`} className="hover:underline">
                      {v.registration}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {v.make_model ?? "—"}
                  </td>
                  <td className="px-4 py-3">{renewalBadge("MOT", v.mot_due_date)}</td>
                  <td className="px-4 py-3">
                    {renewalBadge("Insurance", v.insurance_renewal_date)}
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
