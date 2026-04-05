"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function JobsStatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "";

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <label htmlFor="status" className="text-sm text-slate-600">
        Status
      </label>
      <select
        id="status"
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `/jobs?status=${encodeURIComponent(v)}` : "/jobs");
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
