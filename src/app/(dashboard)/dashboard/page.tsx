import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getJobs } from "@/actions/jobs";
import { getJobLatestFollowups, type FollowupRow } from "@/actions/contact-log";
import { formatCurrency } from "@/lib/format-currency";
import { calendarDaysToInvoiceDue, inOverdueBucket, invoiceDueMs, jobAmount, paymentTermsDaysOrDefault, type JobPayFields } from "@/lib/jobs-payment-buckets";
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
  showSign = true,
}: {
  label: string;
  value: number;
  currencyCode: string | null;
  tone: "positive" | "negative" | "reserve";
  large?: boolean;
  showSign?: boolean;
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
        {value > 0 && showSign ? "+" : ""}
        {formatCurrency(value, currencyCode)}
      </span>
    </div>
  );
}

function SectionLabel({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {eyebrow}
      </p>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description ? <p className="text-sm text-slate-500">{description}</p> : null}
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

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

  const [metrics, jobsRes, followupsRes] = await Promise.all([
    getPeriodMetrics(supabase, profile.tenant_id, { year, month }, now),
    getJobs(),
    getJobLatestFollowups(),
  ]);
  const currencyCode = metrics.currencyCode;
  const dashboardJobs = (jobsRes.data ?? []) as Array<
    JobPayFields & {
      id: string;
      client_name?: string | null;
      title?: string | null;
    }
  >;
  const followupMap = new Map<string, FollowupRow>();
  for (const followup of followupsRes.data ?? []) {
    followupMap.set(followup.job_id, followup);
  }

  if (jobsRes.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {jobsRes.error}
      </div>
    );
  }

  const formatShortDate = (value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "—";
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
  };

  const cashFlowMax = Math.max(metrics.incomeReceived, metrics.outgoings, metrics.wagesPaid, 1);
  const incomeBarPct = Math.max(6, Math.round((metrics.incomeReceived / cashFlowMax) * 100));
  const outgoingsBarPct = Math.max(6, Math.round((metrics.outgoings / cashFlowMax) * 100));
  const wagesBarPct = Math.max(6, Math.round((metrics.wagesPaid / cashFlowMax) * 100));

  const topCards: {
    title: string;
    value: number;
    amount: string;
    href: string;
    sub: string;
    urgent?: boolean;
  }[] = [
    {
      title: "Ready To Invoice",
      value: metrics.readyToInvoice,
      amount: formatCurrency(metrics.readyToInvoiceValue, currencyCode),
      href: "/jobs?range=week&pay=todo",
      sub: "Completed work waiting for an invoice.",
    },
    {
      title: "Awaiting Payment",
      value: metrics.awaitingPayment,
      amount: formatCurrency(metrics.awaitingPaymentValue, currencyCode),
      href: "/jobs?range=week&pay=outstanding",
      sub: "Invoices sent, still within terms.",
    },
    {
      title: "Overdue Payments",
      value: metrics.overdueCount,
      amount: formatCurrency(metrics.overdueValue, currencyCode),
      href: "/jobs?range=week&pay=overdue",
      sub: "Invoices past due and needing chase.",
      urgent: true,
    },
    {
      title: "Pending Quotes",
      value: metrics.pendingQuotes,
      amount: formatCurrency(metrics.pendingQuotesValue, currencyCode),
      href: "/quotes?status=awaiting_response",
      sub: "Open quote pipeline waiting on a reply.",
    },
  ];

  const workCards: {
    title: string;
    value: number;
    amount: string;
    href: string;
    sub: string;
    urgent?: boolean;
  }[] = [
    {
      title: "Jobs Today",
      value: metrics.jobsToday,
      amount: formatCurrency(metrics.jobsTodayValue, currencyCode),
      href: "/jobs?range=today&pay=work",
      sub: "Book today’s work at a glance.",
    },
    {
      title: "Jobs This Week",
      value: metrics.jobsThisWeek,
      amount: formatCurrency(metrics.jobsThisWeekValue, currencyCode),
      href: "/jobs?range=week&pay=work",
      sub: "Scheduled and active this week.",
    },
    {
      title: "Past Due Jobs",
      value: metrics.pastDueJobs,
      amount: formatCurrency(metrics.pastDueJobsValue, currencyCode),
      href: "/jobs?range=pastdue&pay=work",
      sub: "Work that slipped before today.",
      urgent: true,
    },
    {
      title: "Upcoming Jobs",
      value: metrics.upcomingJobs,
      amount: formatCurrency(metrics.upcomingJobsValue, currencyCode),
      href: "/jobs?range=future&pay=work",
      sub: "Scheduled after this week.",
    },
  ];

  const salesCards: {
    title: string;
    value: string;
    amount: string;
    href: string;
    sub: string;
  }[] = [
    {
      title: "Quotes Sent This Month",
      value: String(metrics.quotesSentThisMonth),
      amount: formatCurrency(metrics.quotesSentThisMonthValue, currencyCode),
      href: "/quotes?status=sent",
      sub: "Quotes actually sent this month.",
    },
    {
      title: "Quotes Won This Month",
      value: String(metrics.quotesWonThisMonth),
      amount: formatCurrency(metrics.quotesWonThisMonthValue, currencyCode),
      href: "/quotes?status=accepted",
      sub: "Accepted or booked this month.",
    },
    {
      title: "Quote Conversion",
      value: `${metrics.quoteConversionRate.toFixed(0)}%`,
      amount: "Won ÷ sent",
      href: "/quotes",
      sub: "How many sent quotes turn into work.",
    },
    {
      title: "Open Quote Pipeline",
      value: formatCurrency(metrics.pendingQuotesValue, currencyCode),
      amount: `${metrics.pendingQuotes} open`,
      href: "/quotes?status=awaiting_response",
      sub: "Draft, pending, quoted, and sent quotes.",
    },
  ];

  const pipelineStages: {
    title: string;
    value: number;
    amount: string;
    href: string;
    sub: string;
  }[] = [
    {
      title: "Lead",
      value: metrics.leadQuotes,
      amount: formatCurrency(metrics.leadQuotesValue, currencyCode),
      href: "/quotes",
      sub: "Draft and pending enquiries.",
    },
    {
      title: "Quote",
      value: metrics.quotesSentThisMonth,
      amount: formatCurrency(metrics.quotesSentThisMonthValue, currencyCode),
      href: "/quotes?status=sent",
      sub: "Quoted work sent this month.",
    },
    {
      title: "Won Job",
      value: metrics.quotesWonThisMonth,
      amount: formatCurrency(metrics.quotesWonThisMonthValue, currencyCode),
      href: "/jobs",
      sub: "Accepted or booked work.",
    },
    {
      title: "Invoiced",
      value: metrics.invoicedThisMonthCount,
      amount: formatCurrency(metrics.invoicedThisMonthValue, currencyCode),
      href: "/jobs?range=week&pay=outstanding",
      sub: "Invoices raised this month.",
    },
    {
      title: "Paid",
      value: metrics.paidThisMonthCount,
      amount: formatCurrency(metrics.paidThisMonthValue, currencyCode),
      href: "/collections",
      sub: "Money collected this month.",
    },
  ];

  type OverdueDebtRow = {
    id: string;
    clientName: string;
    amount: number;
    amountLabel: string;
    daysLate: number;
    lastContactDate: string;
    status: string;
    jobRef: string;
  };

  const overdueDebtRows: OverdueDebtRow[] = dashboardJobs
    .filter((job) => inOverdueBucket(job))
    .map((job) => {
      const followup = followupMap.get(job.id) ?? null;
      const dueMs = invoiceDueMs(job.invoice_sent_at, paymentTermsDaysOrDefault(job));
      const daysLate = dueMs != null ? Math.max(1, -calendarDaysToInvoiceDue(dueMs)) : 0;
      const amount = jobAmount(job);
      return {
        id: job.id,
        clientName: job.client_name ?? "Unknown client",
        amount,
        amountLabel: formatCurrency(amount, currencyCode),
        daysLate,
        lastContactDate: formatShortDate(followup?.contacted_at),
        status:
          followup?.status?.replaceAll("_", " ") ??
          (job.payment_status?.trim() || "Overdue"),
        jobRef: job.title?.trim() || job.id,
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount || a.clientName.localeCompare(b.clientName));

  const overdueSummary =
    overdueDebtRows.length > 0
      ? `${overdueDebtRows.length} invoice${overdueDebtRows.length === 1 ? "" : "s"} to chase`
      : "Nothing overdue right now";


  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            A business-first view of cash, work, quotes, and overdue follow-up.
          </p>
        </div>
        <div className="shrink-0 mt-1">
          <MonthNav year={year} month={month} />
        </div>
      </div>

      <section className="mt-6">
        <SectionLabel eyebrow="Money waiting to come in" title="Cash to collect" description="The items most likely to affect near-term cash." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {topCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className={`group rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                card.urgent
                  ? "border-red-200 bg-gradient-to-b from-red-50 to-white hover:border-red-300"
                  : "border-slate-200 bg-gradient-to-b from-white to-slate-50 hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
                    card.urgent ? "text-red-600" : "text-slate-400"
                  }`}>
                    {card.urgent ? "Urgent" : "At a glance"}
                  </p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{card.title}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  card.urgent ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {card.urgent ? "Chase" : "Open"}
                </span>
              </div>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className={`text-3xl font-semibold tracking-tight tabular-nums ${
                    card.urgent ? "text-red-700" : "text-slate-900"
                  }`}>
                    {card.value}
                  </p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${
                    card.urgent ? "text-red-700" : "text-slate-800"
                  }`}>
                    {card.amount}
                  </p>
                </div>
                <p className="mb-1 text-xs font-medium text-slate-400 transition group-hover:text-slate-600">Open →</p>
              </div>
              <p className="mt-4 text-sm leading-5 text-slate-600">{card.sub}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionLabel eyebrow="Today" title="Today’s work" description="The operational load for the day and week ahead." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {workCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className={`group rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                card.urgent
                  ? "border-red-200 bg-gradient-to-b from-red-50 to-white hover:border-red-300"
                  : "border-slate-200 bg-gradient-to-b from-white to-slate-50 hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
                    card.urgent ? "text-red-600" : "text-slate-400"
                  }`}>
                    {card.urgent ? "Needs attention" : "Queue"}
                  </p>
                  <p className="mt-2 text-base font-semibold text-slate-900">{card.title}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  card.urgent ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {card.urgent ? "Overdue" : "Open"}
                </span>
              </div>
              <p className={`mt-4 text-3xl font-semibold tracking-tight tabular-nums ${
                card.urgent ? "text-red-700" : "text-slate-900"
              }`}>
                {card.value}
              </p>
              <p className={`mt-1 text-lg font-semibold tracking-tight tabular-nums ${
                card.urgent ? "text-red-700" : "text-slate-800"
              }`}>
                {card.amount}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{card.sub}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionLabel eyebrow="Sales pipeline" title="Quote performance" description="How the quote flow is converting into booked work." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {salesCards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{card.title}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{card.value}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-800">{card.amount}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{card.sub}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionLabel eyebrow="Pipeline summary" title="Lead → Quote → Won Job → Invoiced → Paid" description="A compact view of the pipeline stages owners care about most." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {pipelineStages.map((stage, index) => (
            <Link
              key={stage.title}
              href={stage.href}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {index === 0 ? "Start" : index === pipelineStages.length - 1 ? "Cash" : "Stage"}
              </p>
              <p className="mt-2 text-base font-semibold text-slate-900">{stage.title}</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
                {stage.value}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-800">
                {stage.amount}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{stage.sub}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Business financials</h2>
              <p className="text-sm text-slate-500">{monthLabel}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Owner view
            </span>
          </div>
          <CashFlowBar label="Income This Month" value={formatCurrency(metrics.incomeReceived, currencyCode)} pct={incomeBarPct} color="#16a34a" />
          <CashFlowBar label="Outgoings This Month" value={formatCurrency(metrics.outgoings, currencyCode)} pct={outgoingsBarPct} color="#dc2626" />
          {metrics.wagesPaid > 0 ? (
            <CashFlowBar label="Wages (approved)" value={formatCurrency(metrics.wagesPaid, currencyCode)} pct={wagesBarPct} color="#d97706" />
          ) : null}
          <div className="my-4 border-t border-slate-100" />
          <FinancialSummaryRow label="Net Profit" value={metrics.netProfit} currencyCode={currencyCode} tone={metrics.netProfit >= 0 ? "positive" : "negative"} large />
          <FinancialSummaryRow label="Tax Reserve" value={metrics.taxReserve} currencyCode={currencyCode} tone="reserve" />
          {metrics.vatRegistered ? (
            <FinancialSummaryRow label="VAT Estimate" value={metrics.vatLiabilityEstimate} currencyCode={currencyCode} tone="reserve" showSign={false} />
          ) : null}
          <FinancialSummaryRow label="Spendable This Month" value={metrics.spendableThisMonth} currencyCode={currencyCode} tone={metrics.spendableThisMonth >= 0 ? "positive" : "negative"} large />
          <p className="mt-3 text-xs text-slate-400">
            Tax reserve is 20% of invoices raised this month (accrual basis).
            {metrics.vatRegistered
              ? " VAT estimate is invoice VAT minus VAT on recorded outgoings for the selected month."
              : ""}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <SectionLabel eyebrow="Attention required" title="Overdue payments" description={overdueSummary} />
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Client</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Days late</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Last contact date</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overdueDebtRows.length > 0 ? (
                overdueDebtRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-900">{row.clientName}</div>
                      <div className="text-xs text-slate-500">{row.jobRef}</div>
                    </td>
                    <td className="px-4 py-3 align-top font-semibold tabular-nums text-red-700">{row.amountLabel}</td>
                    <td className="px-4 py-3 align-top tabular-nums text-slate-700">{row.daysLate}</td>
                    <td className="px-4 py-3 align-top text-slate-700">{row.lastContactDate}</td>
                    <td className="px-4 py-3 align-top text-slate-700">{row.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    No overdue payments right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
