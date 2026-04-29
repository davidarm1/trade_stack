import { Suspense } from "react";
import { getWages } from "@/actions/wages";
import { getTeamMembers } from "@/actions/team";
import { formatCurrency } from "@/lib/format-currency";
import { getTenantCurrencyCode } from "@/lib/tenant-currency";
import { ApprovalBadge, WagesFilters } from "./wages-filters";

export default async function WagesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const currencyCode = await getTenantCurrencyCode();
  const team = await getTeamMembers();
  const { data: rows, error } = await getWages({
    userId: params.userId,
    periodFrom: params.from,
    periodTo: params.to,
  });

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  const userOptions = (team.data ?? []).map(
    (u: { id: string; name: string | null }) => ({
      id: u.id,
      name: u.name,
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Wages</h1>
      <p className="mt-1 text-sm text-slate-600">
        Payroll periods and approval workflow.
      </p>

      <Suspense
        fallback={
          <div className="mt-6 h-16 animate-pulse rounded-md bg-slate-100" />
        }
      >
        <WagesFilters userOptions={userOptions} />
      </Suspense>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Period
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                User
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Total wage
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Approval
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No wage records.
                </td>
              </tr>
            ) : (
              (rows ?? []).map(
                (w: {
                  id: string;
                  period_date?: string | null;
                  user_id?: string | null;
                  total_wage?: number | null;
                  approval_status?: string | null;
                }) => (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">
                      {w.period_date
                        ? new Date(w.period_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {userOptions.find((u) => u.id === w.user_id)?.name ??
                        w.user_id ??
                        "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {w.total_wage != null
                        ? formatCurrency(w.total_wage, currencyCode)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ApprovalBadge status={w.approval_status} />
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
