import { Suspense } from "react";
import { getTimesheets } from "@/actions/timesheets";
import { getTeamMembers } from "@/actions/team";
import { TimesheetsFilters } from "./timesheets-filters";

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const team = await getTeamMembers();
  const { data: rows, error } = await getTimesheets({
    userId: params.userId,
    from: params.from,
    to: params.to,
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
      <h1 className="text-2xl font-semibold text-slate-900">Timesheets</h1>
      <p className="mt-1 text-sm text-slate-600">
        Shift entries for your team — filtered by user and date range.
      </p>

      <Suspense
        fallback={
          <div className="mt-6 h-16 animate-pulse rounded-md bg-slate-100" />
        }
      >
        <TimesheetsFilters userOptions={userOptions} />
      </Suspense>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Date
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                User
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Start
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                End
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Minutes
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Status
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
                  No timesheet rows.
                </td>
              </tr>
            ) : (
              (rows ?? []).map(
                (t: {
                  id: string;
                  shift_date?: string | null;
                  user_id?: string | null;
                  start_time?: string | null;
                  end_time?: string | null;
                  duration_minutes?: number | null;
                  status?: string | null;
                }) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">
                      {t.shift_date
                        ? new Date(t.shift_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {userOptions.find((u) => u.id === t.user_id)?.name ??
                        t.user_id ??
                        "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.start_time ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.end_time ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {t.duration_minutes ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.status ?? "—"}
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
