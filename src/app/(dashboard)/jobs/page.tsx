import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getJobs } from "@/actions/jobs";
import { isFutureJob } from "@/lib/jobs-week-range";
import { formatCurrency } from "@/lib/format-currency";
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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "";
  const searchQuery = params.q?.trim() ?? "";
  const range = params.range === "future" ? "future" : "week";
  const pay = parsePayTab(params.pay);

  if (params.range === undefined || params.pay === undefined) {
    const p = new URLSearchParams();
    p.set("range", range);
    p.set("pay", pay);
    if (statusFilter) p.set("status", statusFilter);
    if (searchQuery) p.set("q", searchQuery);
    redirect(`/jobs?${p.toString()}`);
  }

  const { data: rows, error } = await getJobs(
    searchQuery ? { search: searchQuery } : undefined,
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
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
    // Work tabs should only show active delivery states.
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

  const weekJobs = workQueue.filter(
    (j) => !isFutureJob((j as { date_onsite?: string | null }).date_onsite),
  );
  const futureJobs = workQueue.filter((j) =>
    isFutureJob((j as { date_onsite?: string | null }).date_onsite),
  );

  const payFiltered =
    pay === "work"
      ? []
      : statusFiltered.filter((j) => matchesPayTab(payRow(j), pay));
  const list =
    pay === "work" ? (range === "future" ? futureJobs : weekJobs) : payFiltered;
  const totalRows = (rows ?? []).length;
  const showDfiColumn = pay === "outstanding" || pay === "overdue";
  const tableColCount = showDfiColumn ? 10 : 9;

  let emptyMessage = "No jobs in this week and earlier (or undated).";
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
        : "No active jobs this week.";
  } else if (payFiltered.length === 0) {
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
            This week is Mon–Sun (local time). Future jobs are scheduled after
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
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Payment status
              </th>
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
                    <td className="px-4 py-3 text-slate-700">
                      {j.payment_status ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <JobsRowActions jobId={j.id} />
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
