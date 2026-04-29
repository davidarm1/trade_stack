import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getJobs } from "@/actions/jobs";
import { formatCurrency } from "@/lib/format-currency";
import { isFutureJob } from "@/lib/jobs-week-range";
import {
  inOutstandingBucket,
  inOverdueBucket,
  inTodoBucket,
  jobAmount,
  sumJobAmounts,
  type JobPayFields,
} from "@/lib/jobs-payment-buckets";
import { getTenantContext } from "@/lib/tenant";
import { getTenantCurrencyCode } from "@/lib/tenant-currency";

function payRow(j: unknown): JobPayFields {
  return j as JobPayFields;
}

function localMonthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

function timestampInRange(iso: string | null | undefined, start: Date, end: Date): boolean {
  const raw = String(iso ?? "").trim();
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

async function getReceiptsMonthTotal(tenantId: string, start: Date, end: Date) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select("amount_total")
    .eq("tenant_id", tenantId)
    .is("parent_receipt_id", null)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (error) return { total: 0, error: error.message };
  const total = (data ?? []).reduce((s, r) => s + Number(r.amount_total ?? 0), 0);
  return { total, error: null };
}

async function getPendingQuotesCount(tenantId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("status", ["draft", "sent", "pending"]);

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0, error: null };
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

  const [{ data: rows, error: jobsError }, currencyCode, monthBounds] = await Promise.all([
    getJobs(),
    getTenantCurrencyCode(),
    Promise.resolve(localMonthBounds()),
  ]);

  if (jobsError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {jobsError}
      </div>
    );
  }

  const all = rows ?? [];
  const activeWorkStatuses = new Set(["open", "in_progress", "scheduled"]);
  const workQueue = all.filter((j) => {
    const status = ((j as { status?: string | null }).status ?? "").trim().toLowerCase();
    return activeWorkStatuses.has(status);
  });
  const weekJobs = workQueue.filter(
    (j) => !isFutureJob((j as { date_onsite?: string | null }).date_onsite),
  );
  const futureJobs = workQueue.filter((j) =>
    isFutureJob((j as { date_onsite?: string | null }).date_onsite),
  );

  const todoJobs = all.filter((j) => inTodoBucket(payRow(j)));
  const outstandingJobs = all.filter((j) => inOutstandingBucket(payRow(j)));
  const overdueJobs = all.filter((j) => inOverdueBucket(payRow(j)));

  const invoicedThisMonthJobs = all.filter((j) =>
    timestampInRange(
      (j as { invoice_sent_at?: string | null }).invoice_sent_at,
      monthBounds.start,
      monthBounds.end,
    ),
  );
  const paidThisMonthJobs = all.filter((j) =>
    timestampInRange(
      (j as { invoice_paid_at?: string | null }).invoice_paid_at,
      monthBounds.start,
      monthBounds.end,
    ),
  );

  const [receiptsMonth, pendingQuotes] = await Promise.all([
    getReceiptsMonthTotal(ctx.tenantId, monthBounds.start, monthBounds.end),
    getPendingQuotesCount(ctx.tenantId),
  ]);

  const outstandingTotal = sumJobAmounts(outstandingJobs as JobPayFields[]);
  const overdueTotal = sumJobAmounts(overdueJobs as JobPayFields[]);
  const invoicedMonthTotal = sumJobAmounts(invoicedThisMonthJobs as JobPayFields[]);
  const paidMonthTotal = sumJobAmounts(paidThisMonthJobs as JobPayFields[]);

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(monthBounds.start);

  const pipelineCards = [
    {
      title: "Jobs this week",
      value: String(weekJobs.length),
      sub: "Open, in progress, or scheduled — onsite this week or undated",
      href: "/jobs?range=week&pay=work",
    },
    {
      title: "Future jobs",
      value: String(futureJobs.length),
      sub: "Scheduled after this Sunday",
      href: "/jobs?range=future&pay=work",
    },
    {
      title: "To be invoiced",
      value: String(todoJobs.length),
      sub: "Same bucket as the Jobs tab",
      href: "/jobs?range=week&pay=todo",
    },
    {
      title: "Invoiced (within terms)",
      value: String(outstandingJobs.length),
      amount: outstandingJobs.length > 0 ? formatCurrency(outstandingTotal, currencyCode) : null,
      sub: "Sent, not paid, not overdue",
      href: "/jobs?range=week&pay=outstanding",
    },
    {
      title: "Payment overdue",
      value: String(overdueJobs.length),
      amount: overdueJobs.length > 0 ? formatCurrency(overdueTotal, currencyCode) : null,
      sub: "Same rules as the Jobs tab",
      href: "/jobs?range=week&pay=overdue",
    },
    {
      title: "Pending quotes",
      value: String(pendingQuotes.count),
      sub: "Draft, sent, or pending",
      href: "/quotes",
    },
  ];

  const monthCards = [
    {
      title: "Invoiced this month",
      value: formatCurrency(invoicedMonthTotal, currencyCode),
      sub: `${invoicedThisMonthJobs.length} invoice${invoicedThisMonthJobs.length === 1 ? "" : "s"} sent (${monthLabel}, to date)`,
      href: "/jobs",
    },
    {
      title: "Paid this month",
      value: formatCurrency(paidMonthTotal, currencyCode),
      sub: `${paidThisMonthJobs.length} payment${paidThisMonthJobs.length === 1 ? "" : "s"} recorded (${monthLabel}, to date)`,
      href: "/jobs",
    },
    {
      title: "Outgoings this month",
      value: formatCurrency(receiptsMonth.total, currencyCode),
      sub:
        receiptsMonth.error == null
          ? "Receipts created this month (top-level rows)"
          : `Could not load receipts: ${receiptsMonth.error}`,
      href: "/receipts",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-600">
        This month and billing pipeline use the same rules as the Jobs page (tabs and amounts).
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          This month ({monthLabel})
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {monthCards.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
            >
              <p className="text-sm font-medium text-slate-500">{c.title}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{c.value}</p>
              <p className="mt-1 text-xs text-slate-500">{c.sub}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Billing & work queue
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pipelineCards.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
            >
              <p className="text-sm font-medium text-slate-500">{c.title}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{c.value}</p>
              {c.amount ? (
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-800">{c.amount}</p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">{c.sub}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
