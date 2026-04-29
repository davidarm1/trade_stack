"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { parsePayTab } from "@/lib/jobs-payment-buckets";

export function JobsStatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "";
  const range = searchParams.get("range") === "future" ? "future" : "week";
  const pay = parsePayTab(searchParams.get("pay") ?? undefined);
  const q = searchParams.get("q")?.trim() ?? "";

  function pushWithRange(status: string) {
    const p = new URLSearchParams();
    p.set("range", range);
    p.set("pay", pay);
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    router.push(`/jobs?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="status" className="text-sm text-slate-600">
        Status
      </label>
      <select
        id="status"
        value={current}
        onChange={(e) => {
          pushWithRange(e.target.value);
        }}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">All</option>
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="scheduled">Scheduled</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>
  );
}
