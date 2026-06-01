import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardUserRole } from "@/lib/dashboard-role";
import { formatCurrency } from "@/lib/format-currency";
import { getPeriodMetrics, londonPartsOf } from "@/lib/metrics/period-totals";
import { MonthNav } from "./month-nav";

function CashFlowBar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function FinancialSummaryRow({
  label,
  value,
  currencyCode,
  tone,
  large = false,
}: {
  label: string;
  value: number;
  currencyCode: string | null;
  tone: "positive" | "negative" | "reserve";
  large?: boolean;
}) {
  const valueClass =
    tone === "reserve"
      ? "text-amber-700"
      : tone === "positive"
        ? "text-emerald-700"
        : "text-red-700";
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={large ? "text-sm font-semibold text-slate-800" : "text-sm text-slate-600"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${large ? "text-base font-bold" : "text-sm font-medium"} ${valueClass}`}
      >
        {value > 0 ? "+" : ""}
        {formatCurrency(value, currencyCode)}
      </span>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Not authenticated
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        No tenant profile — complete onboarding or contact support.
      </div>
    );
  }

  const now = new Date();
  const londonNow = londonPartsOf(now);
  let year = londonNow.year;
  let month = londonNow.month;

  const resolvedParams = searchParams ? await searchParams : {};
  const monthParam = resolvedParams?.month;
  if (monthParam) {
    const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
    if (match) {
      const py = parseInt(match[1], 10);
      const pm = parseInt(match[2], 10);
      if (pm >= 1 && pm <= 12) {
        year = py;
        month = pm;
      }
    }
  }

  const [metrics, userRole] = await Promise.all([
    getPeriodMetrics(supabase, profile.tenant_id, { year, month }, now),
    getDashboardUserRole(),
  ]);
  const currencyCode = metrics.currencyCode;

  const isOfficeOrOwner = userRole === "owner" || userRole === "office";

  const cashFlowMax = Math.max(
    metrics.incomeReceived,
    metrics.outgoings,
    metrics.wagesPaid,
    1,
  );
  const incomeBarPct = Math.max(6, Math.round((metrics.incomeReceived / cashFlowMax) * 100));
  const outgoingsBarPct = Math.max(6, Math.round((metrics.outgoings / cashFlowMax) * 100));
  const wagesBarPct = Math.max(6, Math.round((metrics.wagesPaid / cashFlowMax) * 100));

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

  const monthCards = [
    {
      title: "Invoiced this month",
      value: formatCurrency(metrics.invoicedAccrued, currencyCode),
      sub: `Accrual basis (${monthLabel}, to date)`,
      href: "/jobs",
    },
    {
      title: "Income this month",
      value: formatCurrency(metrics.incomeReceived, currencyCode),
      sub: `Cash basis — payments received (${monthLabel}, to date)`,
      href: "/jobs",
    },
    {
      title: "Outgoings this month",
      value: formatCurrency(metrics.outgoings, currencyCode),
      sub: "Receipts created this month",
      href: "/receipts",
    },
    {
      title: "Net this month",
      value: formatCurrency(Math.abs(metrics.netProfit), currencyCode),
      positive: metrics.netProfit >= 0,
      sub: "Income − Outgoings − Wages (approved this month)",
      href: "/jobs",
    },
  ];

  const pipelineCards: {
    title: string;
    value: string;
    amount?: string | null;
    sub: string;
    href: string;
    tone?: "danger";
  }[] = [
    {
      title: "Past due",
      value: String(metrics.pastDueJobs),
      amount:
        metrics.pastDueJobs > 0
          ? formatCurrency(metrics.pastDueJobsValue, currencyCode)
          : null,
      sub: "Scheduled before today — not completed or cancelled",
      href: "/jobs?range=pastdue&pay=work",
      tone: "danger",
    },
    {
      title: "Jobs this week",
      value: String(metrics.jobsThisWeek),
      sub: "Open, in progress, or scheduled — onsite this week (dated only)",
      href: "/jobs?range=week&pay=work",
    },
    {
      title: "Upcoming jobs",
      value: String(metrics.upcomingJobs),
      sub: "Scheduled after this Sunday",
      href: "/jobs?range=future&pay=work",
    },
    {
      title: "Ready to invoice",
      value: String(metrics.readyToInvoice),
      sub: "Completed jobs waiting for an invoice",
      href: "/jobs?range=week&pay=todo",
    },
    {
      title: "Awaiting payment",
      value: String(metrics.awaitingPayment),
      amount:
        metrics.awaitingPayment > 0
          ? formatCurrency(metrics.awaitingPaymentValue, currencyCode)
          : null,
      sub: "Sent, not paid, not overdue",
      href: "/jobs?range=week&pay=outstanding",
    },
    {
      title: "Pending quotes",
      value: String(metrics.pendingQuotes),
      amount:
        metrics.pendingQuotes > 0
          ? formatCurrency(metrics.pendingQuotesValue, currencyCode)
          : null,
      sub: "Draft, sent, or pending",
      href: "/quotes",
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            This month and billing pipeline use the same rules as the Jobs page (tabs and amounts).
          </p>
        </div>
        <div className="shrink-0 mt-1">
          <MonthNav year={year} month={month} />
        </div>
      </div>

      {/* Cash Flow Section */}
      <section className="mt-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Cash Flow</h2>
            <span className="text-xs text-slate-400">{monthLabel}</span>
          </div>
          <CashFlowBar
            label="Income this month"
            value={formatCurrency(metrics.incomeReceived, currencyCode)}
            pct={incomeBarPct}
            color="#16a34a"
          />
          <CashFlowBar
            label="Outgoings this month"
            value={formatCurrency(metrics.outgoings, currencyCode)}
            pct={outgoingsBarPct}
            color="#dc2626"
          />
          {metrics.wagesPaid > 0 ? (
            <CashFlowBar
              label="Wages (approved)"
              value={formatCurrency(metrics.wagesPaid, currencyCode)}
              pct={wagesBarPct}
              color="#d97706"
            />
          ) : null}
          <div className="my-4 border-t border-slate-100" />
          <FinancialSummaryRow
            label="Net Profit"
            value={metrics.netProfit}
            currencyCode={currencyCode}
            tone={metrics.netProfit >= 0 ? "positive" : "negative"}
            large
          />
          <FinancialSummaryRow
            label="Est. Tax Reserve (20%)"
            value={metrics.taxReserve}
            currencyCode={currencyCode}
            tone="reserve"
          />
          <FinancialSummaryRow
            label="Spendable This Month"
            value={metrics.spendableThisMonth}
            currencyCode={currencyCode}
            tone={metrics.spendableThisMonth >= 0 ? "positive" : "negative"}
            large
          />
          <p className="mt-3 text-xs text-slate-400">
            Tax reserve is 20% of invoices raised this month (accrual basis — what HMRC taxes).
            Consult your accountant.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          This month ({monthLabel})
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {monthCards.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
            >
              <p className="text-sm font-medium text-slate-500">{c.title}</p>
              <p
                className={`mt-2 text-2xl font-semibold tabular-nums ${
                  "positive" in c
                    ? c.positive
                      ? "text-emerald-700"
                      : "text-red-700"
                    : "text-slate-900"
                }`}
              >
                {"positive" in c && !c.positive ? "−" : ""}
                {c.value}
              </p>
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
              className={`rounded-xl border p-5 shadow-sm transition ${
                c.tone === "danger"
                  ? "border-red-200 bg-red-50 hover:border-red-300"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  c.tone === "danger" ? "text-red-600" : "text-slate-500"
                }`}
              >
                {c.title}
              </p>
              <p
                className={`mt-2 text-3xl font-semibold tabular-nums ${
                  c.tone === "danger" && Number(c.value) > 0
                    ? "text-red-700"
                    : "text-slate-900"
                }`}
              >
                {c.value}
              </p>
              {c.amount ? (
                <p
                  className={`mt-1 text-lg font-semibold tabular-nums ${
                    c.tone === "danger" ? "text-red-700" : "text-slate-800"
                  }`}
                >
                  {c.amount}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">{c.sub}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Payment Overdue card */}
      {metrics.overdueCount > 0 || isOfficeOrOwner ? (
        <section className="mt-6">
          <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-red-600">Payment overdue</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-red-700">
                  {metrics.overdueCount}
                </p>
                {metrics.overdueCount > 0 ? (
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-red-600">
                    {formatCurrency(metrics.overdueValue, currencyCode)}
                  </p>
                ) : null}
              </div>
              <Link
                href="/jobs?range=week&pay=overdue"
                className="shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                View all
              </Link>
            </div>

            {isOfficeOrOwner && metrics.overdueCount > 0 ? (
              <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
                {metrics.overduePromisedThisWeek.count > 0 ? (
                  <Link
                    href="/jobs?range=week&pay=overdue&followup=promised"
                    className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm hover:bg-emerald-100"
                  >
                    <span className="text-emerald-800">
                      {formatCurrency(metrics.overduePromisedThisWeek.value, currencyCode)} promised
                      this week
                    </span>
                    <span className="text-xs text-emerald-600">
                      {metrics.overduePromisedThisWeek.count} job
                      {metrics.overduePromisedThisWeek.count === 1 ? "" : "s"} →
                    </span>
                  </Link>
                ) : null}
                {metrics.overdueAwaitingReply.count > 0 ? (
                  <Link
                    href="/jobs?range=week&pay=overdue&followup=awaiting_reply"
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
                  >
                    <span className="text-slate-700">
                      {formatCurrency(metrics.overdueAwaitingReply.value, currencyCode)} awaiting
                      reply
                    </span>
                    <span className="text-xs text-slate-500">
                      {metrics.overdueAwaitingReply.count} job
                      {metrics.overdueAwaitingReply.count === 1 ? "" : "s"} →
                    </span>
                  </Link>
                ) : null}
                {metrics.overdueNeedsFirstContact.count > 0 ? (
                  <Link
                    href="/jobs?range=week&pay=overdue&followup=needs_first_contact"
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
                  >
                    <span className="text-slate-700">
                      {formatCurrency(metrics.overdueNeedsFirstContact.value, currencyCode)} needs
                      first contact
                    </span>
                    <span className="text-xs text-slate-500">
                      {metrics.overdueNeedsFirstContact.count} job
                      {metrics.overdueNeedsFirstContact.count === 1 ? "" : "s"} →
                    </span>
                  </Link>
                ) : null}
                {metrics.overdueEscalated.count > 0 ? (
                  <Link
                    href="/jobs?range=week&pay=overdue&followup=escalated"
                    className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm hover:bg-amber-100"
                  >
                    <span className="font-medium text-amber-800">
                      {metrics.overdueEscalated.count} escalated to you
                    </span>
                    <span className="text-xs text-amber-700">→</span>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
