import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboardUserRole } from "@/lib/dashboard-role";
import { getTenantContext } from "@/lib/tenant";
import { getTenantCurrencyCode } from "@/lib/tenant-currency";
import { formatCurrency } from "@/lib/format-currency";
import { getJobs } from "@/actions/jobs";
import { jobAmount, type JobPayFields } from "@/lib/jobs-payment-buckets";

/** ISO week Mon–Sun bounds for a given date (local time) */
function isoWeekBounds(now = new Date()): { start: Date; end: Date; label: string } {
  const day = now.getDay(); // 0=Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon, 0, 0, 0, 0);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6, 23, 59, 59, 999);
  const label = `${mon.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${sun.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  return { start: mon, end: sun, label };
}

function timestampInRange(iso: string | null | undefined, start: Date, end: Date): boolean {
  const raw = String(iso ?? "").trim();
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

async function getFollowUpsThisWeek(tenantId: string, start: Date, end: Date): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("contact_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("contacted_at", start.toISOString())
    .lte("contacted_at", end.toISOString());
  return count ?? 0;
}

export default async function CollectionsPage() {
  const [userRole, ctx] = await Promise.all([
    getDashboardUserRole(),
    getTenantContext(),
  ]);

  if (userRole !== "owner" && userRole !== "office") {
    redirect("/dashboard");
  }

  if (!ctx.success) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {ctx.error}
      </div>
    );
  }

  const week = isoWeekBounds();

  const [{ data: rows, error: jobsError }, currencyCode, followUpCount] = await Promise.all([
    getJobs(),
    getTenantCurrencyCode(),
    getFollowUpsThisWeek(ctx.tenantId, week.start, week.end),
  ]);

  if (jobsError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {jobsError}
      </div>
    );
  }

  const all = rows ?? [];

  const paidThisWeek = all.filter((j) =>
    timestampInRange(
      (j as { invoice_paid_at?: string | null }).invoice_paid_at,
      week.start,
      week.end,
    ),
  );

  const totalCollected = paidThisWeek.reduce((s, j) => s + jobAmount(j as JobPayFields), 0);

  // Top 3 clients by amount paid this week
  const clientTotals = new Map<string, { name: string; total: number }>();
  for (const j of paidThisWeek) {
    const jj = j as { client_id?: string | null; client_name?: string | null } & JobPayFields;
    const clientId = jj.client_id ?? "__unknown__";
    const name = jj.client_name ?? "Unknown client";
    const existing = clientTotals.get(clientId) ?? { name, total: 0 };
    clientTotals.set(clientId, { name, total: existing.total + jobAmount(jj) });
  }

  const topClients = [...clientTotals.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">This week's collections</h1>
        <p className="mt-1 text-sm text-slate-500">{week.label}</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Collected this week</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-emerald-700">
            {formatCurrency(totalCollected, currencyCode)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {paidThisWeek.length} invoice{paidThisWeek.length === 1 ? "" : "s"} marked paid
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Invoices paid</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
            {paidThisWeek.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Payments recorded this week</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Follow-ups logged</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
            {followUpCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Contact log entries this week</p>
        </div>
      </div>

      {topClients.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Top clients this week
          </h2>
          <div className="mt-3 space-y-2">
            {topClients.map((c, i) => (
              <div
                key={c.name}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {i + 1}
                  </span>
                  <span className="font-medium text-slate-900">{c.name}</span>
                </div>
                <span className="text-lg font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(c.total, currencyCode)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          No payments recorded this week yet. Keep going!
        </div>
      )}
    </div>
  );
}
