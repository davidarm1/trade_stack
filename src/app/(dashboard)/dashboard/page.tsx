import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

async function getStats(tenantId: string) {
  const supabase = createClient();

  const [
    openJobs,
    awaitingInvoice,
    overdueInvoices,
    pendingQuotes,
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("status", ["open", "in_progress", "scheduled"]),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .is("invoice_sent_at", null),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("payment_status", "overdue"),
    supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("status", ["draft", "sent", "pending"]),
  ]);

  // TODO: Tune status / payment filters to match your workflow once statuses are finalised.

  return {
    openJobs: openJobs.count ?? 0,
    awaitingInvoice: awaitingInvoice.count ?? 0,
    overdueInvoices: overdueInvoices.count ?? 0,
    pendingQuotes: pendingQuotes.count ?? 0,
  };
}

export default async function DashboardPage() {
  const ctx = await getTenantContext();
  if (!ctx.success) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {ctx.error}
      </div>
    );
  }

  const stats = await getStats(ctx.tenantId);

  const cards = [
    {
      title: "Total open jobs",
      value: stats.openJobs,
      href: "/jobs",
      hint: "Active work in progress",
    },
    {
      title: "Jobs awaiting invoice",
      value: stats.awaitingInvoice,
      href: "/jobs",
      hint: "Not yet invoiced",
    },
    {
      title: "Overdue invoices",
      value: stats.overdueInvoices,
      href: "/jobs",
      hint: "Payment overdue",
    },
    {
      title: "Pending quotes",
      value: stats.pendingQuotes,
      href: "/quotes",
      hint: "Awaiting decision",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-600">
        Overview of work, billing, and quotes for your tenant.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
          >
            <p className="text-sm font-medium text-slate-500">{c.title}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
              {c.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{c.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
