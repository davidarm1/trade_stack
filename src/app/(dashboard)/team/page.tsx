import { getTeamMembers } from "@/actions/team";
import { TEAM_ROLE_HELP } from "@/lib/nav-access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import type { UserRole } from "@/types/database";
import { AddTeamMemberDialog } from "./add-team-member-dialog";
import { TeamMembersBoard } from "./team-management-board";

async function loadTeamRows() {
  const ctx = await getTenantContext();
  if (!ctx.success) {
    return { error: ctx.error } as const;
  }

  const supabase = await createClient();
  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  const currentUserRole = (me?.role as UserRole | undefined) ?? null;

  const { data: rows, error } = await getTeamMembers();
  if (error) {
    return { error } as const;
  }

  let admin = null as ReturnType<typeof createServiceRoleClient> | null;
  try {
    admin = createServiceRoleClient();
  } catch {
    admin = null;
  }

  const rowsWithAuth = await Promise.all(
    (rows ?? []).map(async (row) => {
      let lastSignInAt: string | null = null;
      let hasAuthAccount = false;
      if (admin) {
        try {
          const { data } = await admin.auth.admin.getUserById(row.id);
          hasAuthAccount = Boolean(data.user);
          lastSignInAt = data.user?.last_sign_in_at ?? null;
        } catch {
          hasAuthAccount = false;
          lastSignInAt = null;
        }
      }

      return {
        ...row,
        last_sign_in_at: lastSignInAt,
        has_auth_account: hasAuthAccount,
      };
    }),
  );

  return {
    ctx,
    currentUserRole,
    rows: rowsWithAuth,
  } as const;
}

export default async function TeamPage() {
  const loaded = await loadTeamRows();

  if ("error" in loaded) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {loaded.error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage active and inactive users in your tenant.
          </p>
        </div>
        <AddTeamMemberDialog />
      </div>

      <TeamMembersBoard
        members={loaded.rows}
        currentUserId={loaded.ctx.userId}
        currentUserRole={loaded.currentUserRole}
      />

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <h2 className="font-medium text-slate-900">What each role can see</h2>
        <p className="mt-1 text-xs text-slate-600">
          Sidebar links are filtered by role. Row-level rules in the database may further limit
          data (for example, engineers often only see jobs assigned to them).
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          {(Object.keys(TEAM_ROLE_HELP) as UserRole[]).map((r) => (
            <li key={r}>
              <span className="font-medium capitalize text-slate-900">{r}:</span>{" "}
              {TEAM_ROLE_HELP[r]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
