import Link from "next/link";
import { Suspense } from "react";
import { getJobs } from "@/actions/jobs";
import { JobsStatusFilter } from "./jobs-status-filter";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const { data: rows, error } = await getJobs();
  const statusFilter = searchParams.status ?? "";

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  const list = (rows ?? []).filter((j) => {
    if (!statusFilter) return true;
    return ((j as { status?: string | null }).status ?? "") === statusFilter;
  });

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
          <p className="mt-1 text-sm text-slate-600">
            All jobs for your company, scoped by tenant.
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Job
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="mt-6 h-10 w-48 animate-pulse rounded-md bg-slate-100" />
        }
      >
        <JobsStatusFilter />
      </Suspense>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Job title
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Client
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Engineer
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Date onsite
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Payment status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No jobs yet. Create one to get started.
                </td>
              </tr>
            ) : (
              list.map(
                (j: {
                  id: string;
                  title?: string | null;
                  client_name?: string | null;
                  status?: string | null;
                  engineer_name?: string | null;
                  date_onsite?: string | null;
                  payment_status?: string | null;
                }) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {j.title ?? "Untitled"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.client_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.status ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.engineer_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.date_onsite
                        ? new Date(j.date_onsite).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.payment_status ?? "—"}
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
