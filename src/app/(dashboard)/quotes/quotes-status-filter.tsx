"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function QuotesStatusFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "";

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <label htmlFor="qstatus" className="text-sm text-slate-600">
        Status
      </label>
      <select
        id="qstatus"
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `/quotes?status=${encodeURIComponent(v)}` : "/quotes");
        }}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">All</option>
        <option value="draft">Draft</option>
        <option value="sent">Sent</option>
        <option value="accepted">Accepted</option>
        <option value="declined">Declined</option>
      </select>
    </div>
  );
}
