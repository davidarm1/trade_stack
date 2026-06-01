import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getJobs } from "@/actions/jobs";
import { getJobLatestFollowups, type FollowupRow } from "@/actions/contact-log";
import { getDashboardUserRole } from "@/lib/dashboard-role";
import { londonPartsOf, londonWeekDateKeys } from "@/lib/metrics/period-totals";
import { formatCurrency } from "@/lib/format-currency";
import { JobsRescheduleAction } from "./jobs-reschedule-action";
import {
  calendarDaysToInvoiceDue,
  daysFromInvoiceSent,
  inOutstandingBucket,
  inOverdueBucket,
  inTodoBucket,
  invoiceDueMs,
  matchesPayTab,
  parsePayTab,
  paymentTermsDaysOrDefault,
  sumJobAmounts,
  type JobPayFields,
} from "@/lib/jobs-payment-buckets";
import { getTenantCurrencyCode } from "@/lib/tenant-currency";
import { JobsDfiCell } from "./jobs-dfi-cell";
import { JobsRowActions } from "./jobs-row-actions";
import { JobsSearch } from "./jobs-search";
import { JobsStatusFilter } from "./jobs-status-filter";
import { JobsTableTabs } from "./jobs-table-tabs";
import { LogFollowUpModal } from "./log-followup-modal";

type JobsTableRow = {
  id: string;
  job_number?: number | null;
  legacy_ref?: string | null;
  title?: string | null;
  client_name?: string | null;
  site_address1?: string | null;
  site_address2?: string | null;
  site_town?: string | null;
  site_postcode?: string | null;
  status?: string | null;
  engineer_name?: string | null;
  date_onsite?: string | null;
  payment_status?: string | null;
  invoice_sent_at?: string | null;
  payment_terms_days?: number | null;
  invoice_sent_to_email?: string | null;
  invoice_send_log?: { id: string; sent_at: string }[];
};

function jobsDfiCellProps(j: JobsTableRow) {
  const terms = paymentTermsDaysOrDefault(j as JobPayFields);
  const dueMs = invoiceDueMs(j.invoice_sent_at, terms);
  const daysToInvoiceDue =
    dueMs != null ? calendarDaysToInvoiceDue(dueMs) : null;
  const dueDateLabel =
    dueMs != null
      ? new Date(dueMs).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
  return {
    jobId: j.id,
    jobNumber: j.job_number ?? null,
    jobTitle: j.title ?? null,
    daysFromInvoice: daysFromInvoiceSent(j.invoice_sent_at),
    invoiceDateLabel: j.invoice_sent_at?.trim()
      ? new Date(j.invoice_sent_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—",
    paymentTermsDays: terms,
    dueDateLabel,
    daysToInvoiceDue,
    invoiceSentToEmail: j.invoice_sent_to_email ?? null,
    invoiceSendLog: j.invoice_send_log ?? [],
  };
}

function daysOverdueForJob(j: JobsTableRow): number {
  const terms = paymentTermsDaysOrDefault(j as JobPayFields);
  const dueMs = invoiceDueMs(j.invoice_sent_at, terms);
  if (dueMs == null) return 0;
  return Math.max(1, -calendarDaysToInvoiceDue(dueMs));
}

type OverdueFollowupBucket = "action_due" | "needs_first_contact" | "awaiting_reply" | "promised" | "escalated" | "other";

function followupBucket(followup: FollowupRow | null, today: number): OverdueFollowupBucket {
  if (!followup) return "needs_first_contact";
  const status = followup.status ?? "chased";
  if (followup.next_action_date) {
    const actionMs = Date.parse(followup.next_action_date);
    if (Number.isFinite(actionMs) && actionMs <= today) return "action_due";
  }
  if (status === "awaiting_reply") return "awaiting_reply";
  if (status === "promised_payment") return "promised";
  if (status === "escalated") return "escalated";
  return "other";
}

function sortOverdueList(
  jobs: JobsTableRow[],
  followupMap: Map<string, FollowupRow>,
): JobsTableRow[] {
  const todayStart = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();

  return [...jobs].sort((a, b) => {
    const fa = followupMap.get(a.id) ?? null;
    const fb = followupMap.get(b.id) ?? null;

    const bucketOrder: Record<OverdueFollowupBucket, number> = {
      action_due: 0,
      needs_first_contact: 1,
      awaiting_reply: 2,
      promised: 3,
      escalated: 4,
      other: 5,
    };

    const ba = followupBucket(fa, todayStart);
    const bb = followupBucket(fb, todayStart);

    if (ba !== bb) return bucketOrder[ba] - bucketOrder[bb];

    // Within same bucket, most overdue first
    return daysOverdueForJob(b) - daysOverdueForJob(a);
  });
}

function NextActionCell({ followup }: { followup: FollowupRow | null }) {
  if (!followup) {
    return (
      <span className="text-xs text-slate-500">Needs first contact</span>
    );
  }

  const status = followup.status ?? "chased";

  if (status === "promised_payment" && followup.next_action_date) {
    const label = new Date(followup.next_action_date + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    return <span className="text-sm text-slate-800">Promised: {label}</span>;
  }

  if (status === "awaiting_reply") {
    const since = followup.contacted_at
      ? new Date(followup.contacted_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })
      : null;
    return (
      <div className="text-sm text-slate-800">
        Awaiting reply
        {since ? (
          <div className="text-xs text-slate-500">since {since}</div>
        ) : null}
      </div>
    );
  }

  if (status === "dispute") {
    return <span className="text-sm font-medium text-amber-700">In dispute</span>;
  }

  if (status === "escalated") {
    return <span className="text-sm font-medium text-amber-700">Escalated to owner</span>;
  }

  // chased or other
  const date = followup.contacted_at
    ? new Date(followup.contacted_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "—";
  return <span className="text-sm text-slate-700">Followed up {date}</span>;
}

// followup filter buckets supported via URL ?followup=...
type FollowupFilter = "needs_first_contact" | "awaiting_reply" | "promised" | "escalated" | "";

function parseFollowupFilter(v: string | undefined): FollowupFilter {
  if (v === "needs_first_contact" || v === "awaiting_reply" || v === "promised" || v === "escalated") return v;
  return "";
}

function jobMatchesFollowupFilter(
  filter: FollowupFilter,
  followup: FollowupRow | null,
  today: number,
): boolean {
  if (!filter) return true;
  if (filter === "needs_first_contact") return !followup;
  if (filter === "awaiting_reply") return (followup?.status ?? "") === "awaiting_reply";
  if (filter === "promised") {
    return (followup?.status ?? "") === "promised_payment";
  }
  if (filter === "escalated") return (followup?.status ?? "") === "escalated";
  return true;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "";
  const searchQuery = params.q?.trim() ?? "";
  type RangeParam = "week" | "future" | "pastdue";
  const rawRange = params.range;
  const range: RangeParam =
    rawRange === "future" ? "future" : rawRange === "pastdue" ? "pastdue" : "week";
  const pay = parsePayTab(params.pay);
  const followupFilter = parseFollowupFilter(params.followup);

  if (params.range === undefined || params.pay === undefined) {
    const p = new URLSearchParams();
    p.set("range", range);
    p.set("pay", pay);
    if (statusFilter) p.set("status", statusFilter);
    if (searchQuery) p.set("q", searchQuery);
    redirect(`/jobs?${p.toString()}`);
  }

  const now = new Date();
  const { weekStartKey, weekEndKey } = londonWeekDateKeys(now);
  const { year: todayYear, month: todayMonth, day: todayDay } = londonPartsOf(now);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${todayYear}-${pad2(todayMonth)}-${pad2(todayDay)}`;

  function localDateKeyInRange(
    v: string | null | undefined,
    startKey: string,
    endKey: string,
  ): boolean {
    const raw = String(v ?? "").split("T")[0] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    return raw >= startKey && raw <= endKey;
  }

  const [{ data: rows, error }, userRole] = await Promise.all([
    getJobs(searchQuery ? { search: searchQuery } : undefined),
    getDashboardUserRole(),
  ]);

  const isOfficeOrOwner = userRole === "owner" || userRole === "office";

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  // Fetch follow-up data for the overdue tab (office/owner only)
  let followupMap = new Map<string, FollowupRow>();
  if (pay === "overdue" && isOfficeOrOwner) {
    const { data: followups } = await getJobLatestFollowups();
    for (const f of followups ?? []) {
      followupMap.set(f.job_id, f);
    }
  }

  const statusFiltered = (rows ?? []).filter((j) => {
    if (!statusFilter) return true;
    return ((j as { status?: string | null }).status ?? "") === statusFilter;
  });

  const payRow = (j: unknown) => j as JobPayFields;
  const activeWorkStatuses = new Set(["open", "in_progress", "scheduled"]);
  const workQueue = statusFiltered.filter((j) => {
    const row = j as { status?: string | null };
    const status = (row.status ?? "").trim().toLowerCase();
    return activeWorkStatuses.has(status);
  });

  const todoCount = statusFiltered.filter((j) => inTodoBucket(payRow(j))).length;
  const outstandingForTotals = statusFiltered.filter((j) =>
    inOutstandingBucket(payRow(j)),
  );
  const overdueForTotals = statusFiltered.filter((j) =>
    inOverdueBucket(payRow(j)),
  );
  const outstandingCount = outstandingForTotals.length;
  const overdueCount = overdueForTotals.length;
  const currencyCode = await getTenantCurrencyCode();
  const outstandingTotal = formatCurrency(
    sumJobAmounts(outstandingForTotals as JobPayFields[]),
    currencyCode,
  );
  const overdueTotal = formatCurrency(
    sumJobAmounts(overdueForTotals as JobPayFields[]),
    currencyCode,
  );

  const weekJobs = workQueue.filter((j) =>
    localDateKeyInRange(
      (j as { date_onsite?: string | null }).date_onsite,
      weekStartKey,
      weekEndKey,
    ),
  );
  const futureJobs = workQueue.filter((j) => {
    const raw =
      String((j as { date_onsite?: string | null }).date_onsite ?? "").split("T")[0] ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw > weekEndKey;
  });
  const pastDueStatuses = new Set(["completed", "cancelled"]);
  const pastDueJobsList = statusFiltered.filter((j) => {
    const row = j as { status?: string | null; date_onsite?: string | null };
    if (pastDueStatuses.has(((row.status ?? "") as string).toLowerCase())) return false;
    const raw = String(row.date_onsite ?? "").split("T")[0] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    return raw < todayKey;
  });
  const pastDueCount = pastDueJobsList.length;
  const pastDueValue = formatCurrency(
    sumJobAmounts(pastDueJobsList as JobPayFields[]),
    currencyCode,
  );

  const payFiltered =
    pay === "work"
      ? []
      : statusFiltered.filter((j) => matchesPayTab(payRow(j), pay));

  // Build the display list
  let list: JobsTableRow[] =
    pay === "work"
      ? range === "future"
        ? futureJobs
        : range === "pastdue"
          ? (pastDueJobsList as JobsTableRow[])
          : weekJobs
      : (payFiltered as JobsTableRow[]);

  // Overdue tab: filter out resolved, apply followup bucket filter, then sort
  if (pay === "overdue" && isOfficeOrOwner) {
    list = list.filter((j) => {
      const f = followupMap.get(j.id) ?? null;
      return f?.status !== "resolved";
    });
    if (followupFilter) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      list = list.filter((j) =>
        jobMatchesFollowupFilter(followupFilter, followupMap.get(j.id) ?? null, todayStart.getTime()),
      );
    }
    list = sortOverdueList(list, followupMap);
  }

  const totalRows = (rows ?? []).length;

  const isPastDueTab = pay === "work" && range === "pastdue";

  // Past due tab: oldest first
  if (isPastDueTab) {
    list = [...list].sort((a, b) => {
      const ra = String(a.date_onsite ?? "").split("T")[0] ?? "";
      const rb = String(b.date_onsite ?? "").split("T")[0] ?? "";
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
  }

  const isOverdueTab = pay === "overdue";
  const isOutstandingTab = pay === "outstanding";
  const showDfiColumn = isOutstandingTab;
  const showDaysOverdueColumn = isOverdueTab;
  const showNextActionColumn = isOverdueTab && isOfficeOrOwner;
  const showPaymentStatusColumn = !isOverdueTab && !isPastDueTab;
  const showDaysAgoColumn = isPastDueTab;
  const showRescheduleButton = isPastDueTab;
  const showLogFollowUpButton = isOverdueTab && isOfficeOrOwner;

  // Column counts for colSpan
  // Base: job no, title, site, client, status, engineer, date onsite, [DFI/days overdue/days ago], [payment status], [next action], actions
  let tableColCount = 9; // base without any extras
  if (showDfiColumn) tableColCount += 1;
  if (showDaysOverdueColumn) tableColCount += 1;
  if (showDaysAgoColumn) tableColCount += 1;
  if (!showPaymentStatusColumn) tableColCount -= 1;
  if (showNextActionColumn) tableColCount += 1;

  let emptyMessage = "No jobs found.";
  if (totalRows === 0) {
    emptyMessage = searchQuery
      ? "No jobs match your search."
      : "No jobs yet. Create one to get started.";
  } else if (statusFiltered.length === 0) {
    emptyMessage = "No jobs match this status filter.";
  } else if (pay === "work" && list.length === 0) {
    emptyMessage =
      range === "future"
        ? "No future jobs scheduled beyond this week."
        : range === "pastdue"
          ? "No past-due jobs — all scheduled work is up to date."
          : "No active jobs this week.";
  } else if (payFiltered.length === 0 && pay !== "work") {
    emptyMessage =
      pay === "todo"
        ? "No jobs waiting to be invoiced."
        : pay === "outstanding"
          ? "No invoiced jobs that are still within terms."
          : "No jobs with overdue payment.";
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
          <p className="mt-1 text-sm text-slate-600">
            This week is Mon–Sun (local time). Upcoming jobs are scheduled after
            this Sunday.
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Job
        </Link>
      </div>

      <div className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
        <Suspense
          fallback={
            <div className="h-9 w-48 animate-pulse rounded-md bg-slate-200/60" />
          }
        >
          <JobsStatusFilter />
        </Suspense>
        <Suspense
          fallback={
            <div className="h-10 max-w-md animate-pulse rounded-md bg-slate-200/60" />
          }
        >
          <JobsSearch />
        </Suspense>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <Suspense
          fallback={
            <div className="h-14 animate-pulse bg-slate-50" />
          }
        >
          <JobsTableTabs
            pastDueCount={pastDueCount}
            pastDueValue={pastDueValue}
            weekCount={weekJobs.length}
            futureCount={futureJobs.length}
            todoCount={todoCount}
            outstandingCount={outstandingCount}
            outstandingTotal={outstandingTotal}
            overdueCount={overdueCount}
            overdueTotal={overdueTotal}
          />
        </Suspense>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                <span
                  className="cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2"
                  title="Legacy is imported job numbers from another system."
                >
                  Job no.
                </span>
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Job title
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Site
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Client
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Engineer
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Date onsite
              </th>
              {showDfiColumn ? (
                <th className="px-4 py-3 text-left font-medium text-slate-700">
                  <span
                    className="cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2"
                    title="Days from invoice sent"
                  >
                    DFI
                  </span>
                </th>
              ) : null}
              {showDaysOverdueColumn ? (
                <th className="px-4 py-3 text-left font-medium text-slate-700">
                  Days overdue
                </th>
              ) : null}
              {showDaysAgoColumn ? (
                <th className="px-4 py-3 text-left font-medium text-slate-700">
                  Days past due
                </th>
              ) : null}
              {showPaymentStatusColumn ? (
                <th className="px-4 py-3 text-left font-medium text-slate-700">
                  Payment status
                </th>
              ) : null}
              {showNextActionColumn ? (
                <th className="px-4 py-3 text-left font-medium text-slate-700">
                  Next action
                </th>
              ) : null}
              <th className="px-4 py-3 text-right font-medium text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <tr>
                <td
                  colSpan={tableColCount}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              list.map((j: JobsTableRow) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-sm text-slate-700">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="inline-flex items-center gap-1 underline-offset-2 hover:text-slate-900 hover:underline"
                      >
                        <span>{j.job_number == null ? "—" : String(j.job_number)}</span>
                        {j.legacy_ref?.trim() ? (
                          <>
                            <span className="text-slate-500">/</span>
                            <span
                              className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                              title="Legacy Job Number"
                            >
                              Legacy {j.legacy_ref.trim()}
                            </span>
                          </>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {j.title ?? "Untitled"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {String(j.site_address1 ?? "")
                        .split(",")[0]
                        .trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.client_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.status ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.engineer_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {j.date_onsite
                        ? new Date(j.date_onsite).toLocaleDateString()
                        : "—"}
                    </td>
                    {showDfiColumn ? (
                      <td className="px-4 py-3 text-slate-700">
                        <JobsDfiCell {...jobsDfiCellProps(j)} />
                      </td>
                    ) : null}
                    {showDaysOverdueColumn ? (
                      <td className="px-4 py-3 tabular-nums font-medium text-red-700">
                        {daysOverdueForJob(j)}
                      </td>
                    ) : null}
                    {showDaysAgoColumn ? (
                      <td className="px-4 py-3 tabular-nums font-medium text-red-700">
                        {(() => {
                          const raw = String(j.date_onsite ?? "").split("T")[0] ?? "";
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw >= todayKey) return "—";
                          const ms =
                            new Date(todayKey + "T00:00:00Z").getTime() -
                            new Date(raw + "T00:00:00Z").getTime();
                          return Math.max(1, Math.round(ms / 86_400_000));
                        })()}
                      </td>
                    ) : null}
                    {showPaymentStatusColumn ? (
                      <td className="px-4 py-3 text-slate-700">
                        {j.payment_status ?? "—"}
                      </td>
                    ) : null}
                    {showNextActionColumn ? (
                      <td className="px-4 py-3">
                        <NextActionCell followup={followupMap.get(j.id) ?? null} />
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {showRescheduleButton ? (
                          <JobsRescheduleAction jobId={j.id} />
                        ) : null}
                        {showLogFollowUpButton ? (
                          <LogFollowUpModal
                            jobId={j.id}
                            jobTitle={j.title ?? null}
                          />
                        ) : null}
                        <JobsRowActions jobId={j.id} />
                      </div>
                    </td>
                  </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
