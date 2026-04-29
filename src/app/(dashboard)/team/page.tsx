import { getTeamMembers } from "@/actions/team";
import { TEAM_ROLE_HELP } from "@/lib/nav-access";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";
import { AddTeamMemberDialog } from "./add-team-member-dialog";
import { TeamMembersTable } from "./team-members-table";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentUserId = "";
  let currentUserRole: UserRole | null = null;
  if (user) {
    currentUserId = user.id;
    const { data: me } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    currentUserRole = (me?.role as UserRole | undefined) ?? null;
  }

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
        <AddTeamMemberDialog />
      </div>

      <TeamMembersTable
        rows={rows ?? []}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <h2 className="font-medium text-slate-900">What each role can see</h2>
        <p className="mt-1 text-xs text-slate-600">
          Sidebar links are filtered by role. Row-level rules in the database
          may further limit data (for example, engineers often only see jobs
          assigned to them).
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {(Object.keys(TEAM_ROLE_HELP) as UserRole[]).map((r) => (
            <li key={r}>
              <span className="font-medium capitalize text-slate-900">{r}:</span>{" "}
              {TEAM_ROLE_HELP[r]}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-600">
          Invites need{" "}
          <code className="rounded bg-slate-200/80 px-1">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
          and{" "}
          <code className="rounded bg-slate-200/80 px-1">NEXT_PUBLIC_APP_URL</code>{" "}
          (add the same URL under Supabase → Auth → URL configuration → Redirect
          URLs).
        </p>
      </div>
    </div>
  );
}
