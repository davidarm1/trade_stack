import { getTeamMembers } from "@/actions/team";
import type { UserRole } from "@/types/database";

function roleBadge(role: UserRole | string | null | undefined) {
  const r = String(role ?? "viewer");
  const map: Record<string, string> = {
    owner: "bg-violet-100 text-violet-900 border-violet-200",
    office: "bg-blue-100 text-blue-900 border-blue-200",
    engineer: "bg-amber-100 text-amber-900 border-amber-200",
    viewer: "bg-slate-100 text-slate-800 border-slate-200",
  };
  const cls = map[r] ?? map.viewer;
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {r}
    </span>
  );
}

export default async function TeamPage() {
  const { data: rows, error } = await getTeamMembers();

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
          <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
          <p className="mt-1 text-sm text-slate-600">
            People in your tenant with roles and rates.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex cursor-not-allowed items-center justify-center rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-500"
          title="TODO: Implement Supabase invite or magic link flow"
        >
          Invite User
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Email
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Role
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Active
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
                  No team members.
                </td>
              </tr>
            ) : (
              (rows ?? []).map(
                (u: {
                  id: string;
                  name?: string | null;
                  email?: string | null;
                  role?: UserRole;
                  is_active?: boolean;
                }) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{u.email ?? "—"}</td>
                    <td className="px-4 py-3">{roleBadge(u.role)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {u.is_active ? "Yes" : "No"}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        {/* TODO: Replace disabled button with invite flow (email + role) using Supabase Admin API or invite links. */}
        Invitations require server-side configuration — see README.
      </p>
    </div>
  );
}
