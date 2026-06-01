"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parsePayTab, type PayTab } from "@/lib/jobs-payment-buckets";

type Props = {
  pastDueCount: number;
  pastDueValue: string;
  weekCount: number;
  futureCount: number;
  todoCount: number;
  outstandingCount: number;
  outstandingTotal: string;
  overdueCount: number;
  overdueTotal: string;
};

function buildHref(
  status: string,
  range: "week" | "future" | "pastdue",
  pay: PayTab,
  q: string,
) {
  const p = new URLSearchParams();
  p.set("range", range);
  p.set("pay", pay);
  if (status) p.set("status", status);
  if (q.trim()) p.set("q", q.trim());
  return `/jobs?${p.toString()}`;
}

export function JobsTableTabs({
  pastDueCount,
  pastDueValue,
  weekCount,
  futureCount,
  todoCount,
  outstandingCount,
  outstandingTotal,
  overdueCount,
  overdueTotal,
}: Props) {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const rawRange = searchParams.get("range");
  const range: "week" | "future" | "pastdue" =
    rawRange === "future" ? "future" : rawRange === "pastdue" ? "pastdue" : "week";
  const pay = parsePayTab(searchParams.get("pay") ?? undefined);
  const q = searchParams.get("q") ?? "";

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-slate-50 px-3 pt-2">
      <div
        className="mb-px inline-flex rounded-lg bg-slate-200/80 p-0.5"
        role="group"
        aria-label="Job date range"
      >
        <Link
          href={buildHref(status, "week", "work", q)}
          className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
            range === "week" && pay === "work"
              ? "bg-slate-100 font-semibold text-slate-900 shadow-sm"
              : "font-medium text-slate-600 hover:text-slate-900"
          }`}
        >
          Jobs this week ({weekCount})
        </Link>
        <Link
          href={buildHref(status, "pastdue", "work", q)}
          className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
            range === "pastdue" && pay === "work"
              ? "bg-red-100 font-semibold text-red-900 shadow-sm"
              : pastDueCount > 0
                ? "font-medium text-red-600 hover:text-red-900"
                : "font-medium text-slate-600 hover:text-slate-900"
          }`}
        >
          Past due ({pastDueCount}){pastDueCount > 0 && range !== "pastdue" ? ` ${pastDueValue}` : ""}
        </Link>
        <Link
          href={buildHref(status, "future", "work", q)}
          className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
            range === "future" && pay === "work"
              ? "bg-slate-100 font-semibold text-slate-900 shadow-sm"
              : "font-medium text-slate-600 hover:text-slate-900"
          }`}
        >
          Upcoming jobs ({futureCount})
        </Link>
      </div>

      <Link
        href={buildHref(status, range, "todo", q)}
        className={`inline-flex items-center rounded-t-md border px-3 py-2 text-sm transition-colors ${
          pay === "todo"
            ? "relative z-10 -mb-px border-slate-200 border-b-white bg-white font-semibold text-slate-900"
            : "border-transparent bg-slate-100 font-medium text-slate-700 hover:bg-slate-200/80"
        }`}
      >
        Ready to invoice ({todoCount})
      </Link>
      <Link
        href={buildHref(status, range, "outstanding", q)}
        className={`inline-flex items-center rounded-t-md border px-3 py-2 text-sm transition-colors ${
          pay === "outstanding"
            ? "relative z-10 -mb-px border-slate-200 border-b-slate-50 bg-slate-50 font-semibold text-blue-700 underline"
            : "border-transparent bg-slate-100 font-medium text-blue-700 underline hover:bg-slate-200/80"
        }`}
      >
        Invoiced ({outstandingCount})
        {outstandingCount > 0 ? ` ${outstandingTotal}` : ""}
      </Link>
      <Link
        href={buildHref(status, range, "overdue", q)}
        className={`inline-flex items-center rounded-t-md border px-3 py-2 text-sm transition-colors ${
          pay === "overdue"
            ? "relative z-10 -mb-px border border-red-800 border-b-red-600 bg-red-600 font-semibold text-white underline"
            : "border-transparent bg-red-500 font-medium text-white underline hover:bg-red-600"
        }`}
      >
        Payment overdue ({overdueCount})
        {overdueCount > 0 ? ` ${overdueTotal}` : ""}
      </Link>
    </div>
  );
}
