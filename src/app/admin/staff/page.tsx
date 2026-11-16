import { requirePlatformAdmin } from "@/lib/platform-admin";
import { AddStaffForm, RemoveStaffButton } from "./staff-manager";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const { admin, userId } = await requirePlatformAdmin();
  const { data: rows } = await admin
    .from("platform_admins")
    .select("user_id, created_at")
    .order("created_at", { ascending: true });
  const ids = (rows ?? []).map((r) => r.user_id as string);
  const { data: users } = ids.length
    ? await admin.from("users").select("id, name, email").in("id", ids)
    : { data: [] as { id: string; name: string | null; email: string | null }[] };
  const byId = new Map((users ?? []).map((u) => [u.id as string, u] as const));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Platform staff</h2>
        <p className="mt-1 text-sm text-slate-600">
          People here can open support sessions in any company. They must have two-factor
          authentication set up. Use dedicated staff accounts, and only add people you trust.
        </p>
      </div>
      <AddStaffForm />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Added</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((r) => {
              const u = byId.get(r.user_id as string);
              const me = r.user_id === userId;
              return (
                <tr key={r.user_id as string}>
                  <td className="px-4 py-3 text-slate-900">
                    {u?.name ?? "—"} {me ? <span className="text-xs text-slate-500">(you)</span> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.created_at ? new Date(String(r.created_at)).toLocaleDateString("en-GB") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {me ? null : <RemoveStaffButton userId={r.user_id as string} email={u?.email ?? "this user"} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
