import Link from "next/link";
import { Suspense } from "react";
import { getClients } from "@/actions/clients";
import { ClientsSearch } from "./clients-search";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const { data: rows, error } = await getClients();
  const q = (searchParams.q ?? "").toLowerCase().trim();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  const list = (rows ?? []).filter(
    (c: {
      company_name?: string | null;
      contact_name?: string | null;
      town?: string | null;
    }) => {
      if (!q) return true;
      const hay = [
        c.company_name,
        c.contact_name,
        c.town,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    },
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-600">
            Companies you work with — filtered by tenant.
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Client
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="mt-6 h-10 max-w-md animate-pulse rounded-md bg-slate-100" />
        }
      >
        <ClientsSearch />
      </Suspense>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Company
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Contact
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Town
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Active jobs
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No clients match your search.
                </td>
              </tr>
            ) : (
              list.map(
                (c: {
                  id: string;
                  company_name: string;
                  contact_name?: string | null;
                  contact_email?: string | null;
                  town?: string | null;
                  active_jobs_count?: number;
                }) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {c.company_name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {c.contact_name ?? "—"}
                      {c.contact_email ? (
                        <span className="block text-xs text-slate-500">
                          {c.contact_email}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {c.town ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">
                      {c.active_jobs_count ?? 0}
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
