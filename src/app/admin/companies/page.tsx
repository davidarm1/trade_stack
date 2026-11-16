import { requirePlatformAdmin } from "@/lib/platform-admin";
import { OpenSupportForm } from "./open-support-form";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { admin } = await requirePlatformAdmin();
  const { q } = await searchParams;
  const term = String(q ?? "").trim().replace(/[%_,()]/g, "");

  let query = admin
    .from("tenants")
    .select("id, name, email, is_active, created_at")
    .order("name", { ascending: true })
    .limit(100);
  if (term) query = query.ilike("name", `%${term}%`);
  const { data: tenants, error } = await query;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Companies</h2>
        <p className="mt-1 text-sm text-slate-600">
          Open a time-limited support session inside a company to investigate an issue. Every session
          needs a reason and is recorded in the audit log.
        </p>
      </div>
      <form className="flex gap-2" method="GET">
        <input
          name="q"
          defaultValue={term}
          placeholder="Search company name"
          className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          Search
        </button>
      </form>
      {error ? <p className="text-sm text-red-600">{error.message}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(tenants ?? []).map((t) => (
              <tr key={t.id as string} className="align-top">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {String(t.name ?? "—")}
                  {t.is_active === false ? (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      inactive
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-600">{String(t.email ?? "—")}</td>
                <td className="px-4 py-3 text-slate-600">
                  {t.created_at ? new Date(String(t.created_at)).toLocaleDateString("en-GB") : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <OpenSupportForm tenantId={t.id as string} tenantName={String(t.name ?? "company")} />
                </td>
              </tr>
            ))}
            {(tenants ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No companies found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
