import Link from "next/link";
import { Suspense } from "react";
import { getQuotes } from "@/actions/quotes";
import { QuotesStatusFilter } from "./quotes-status-filter";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const { data: rows, error } = await getQuotes();
  const statusFilter = searchParams.status ?? "";

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  const list = (rows ?? []).filter((q: { status?: string | null }) => {
    if (!statusFilter) return true;
    return (q.status ?? "") === statusFilter;
  });

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Quotes</h1>
          <p className="mt-1 text-sm text-slate-600">
            Estimates and proposals for your customers.
          </p>
        </div>
        <Link
          href="/quotes/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Quote
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="mt-6 h-10 w-48 animate-pulse rounded-md bg-slate-100" />
        }
      >
        <QuotesStatusFilter />
      </Suspense>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Title
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Customer
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Price
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No quotes yet.
                </td>
              </tr>
            ) : (
              list.map(
                (q: {
                  id: string;
                  title?: string | null;
                  customer_name?: string | null;
                  price?: number | null;
                  status?: string | null;
                  quote_date?: string | null;
                }) => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {q.title ?? "Untitled"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {q.customer_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {q.price != null ? q.price.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {q.status ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {q.quote_date
                        ? new Date(q.quote_date).toLocaleDateString()
                        : "—"}
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
