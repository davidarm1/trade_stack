import Link from "next/link";
import { getReceipts } from "@/actions/receipts";

export default async function ReceiptsPage() {
  const { data: rows, error } = await getReceipts();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Receipts</h1>
          <p className="mt-1 text-sm text-slate-600">
            Expense receipts and supplier invoices.
          </p>
        </div>
        <Link
          href="/receipts/upload"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Upload Receipt
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Supplier
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Invoice date
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Amount
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Category
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Payment status
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                AI processed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No receipts yet.
                </td>
              </tr>
            ) : (
              (rows ?? []).map(
                (r: {
                  id: string;
                  supplier_name?: string | null;
                  invoice_date?: string | null;
                  amount_total?: number | null;
                  category?: string | null;
                  payment_status?: string | null;
                  processed_by_ai?: boolean | null;
                }) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">
                      {r.supplier_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.invoice_date
                        ? new Date(r.invoice_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {r.amount_total != null ? r.amount_total.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.category ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.payment_status ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.processed_by_ai ? "Yes" : "No"}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
