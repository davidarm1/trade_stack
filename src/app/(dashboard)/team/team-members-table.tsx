"use client";

import type { UserRole, UserRow } from "@/types/database";
import { EditTeamMemberDialog } from "./edit-team-member-dialog";

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

export function TeamMembersTable({
  rows,
  currentUserId,
  currentUserRole,
}: {
  rows: UserRow[];
  currentUserId: string;
  currentUserRole: UserRole | null;
}) {
  const canManage = currentUserRole === "owner" || currentUserRole === "office";

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
            <th className="px-4 py-3 text-left font-medium text-slate-700">Email</th>
            <th className="px-4 py-3 text-left font-medium text-slate-700">Role</th>
            <th className="px-4 py-3 text-left font-medium text-slate-700">Active</th>
            {canManage ? (
              <th className="px-4 py-3 text-right font-medium text-slate-700">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={canManage ? 5 : 4}
                className="px-4 py-8 text-center text-slate-500"
              >
                No team members.
              </td>
            </tr>
          ) : (
            rows.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{u.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{u.email ?? "—"}</td>
                <td className="px-4 py-3">{roleBadge(u.role)}</td>
                <td className="px-4 py-3 text-slate-700">{u.is_active ? "Yes" : "No"}</td>
                {canManage ? (
                  <td className="px-4 py-3 text-right">
                    <EditTeamMemberDialog
                      member={{
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        role: u.role,
                        is_active: u.is_active,
                      }}
                      currentUserId={currentUserId}
                      currentUserRole={currentUserRole}
                    />
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
