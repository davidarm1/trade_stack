"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function JobsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQ);

  useEffect(() => {
    setValue(urlQ);
  }, [urlQ]);

  function runSearch() {
    const next = value.trim();
    const nextHref = next ? `/jobs?q=${encodeURIComponent(next)}` : "/jobs";
    const currentHref = urlQ.trim() ? `/jobs?q=${encodeURIComponent(urlQ.trim())}` : "/jobs";
    if (nextHref === currentHref) return;
    router.replace(nextHref);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="jobs-search" className="text-sm text-slate-600">
        Search jobs
      </label>
      <input
        id="jobs-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runSearch();
          }
        }}
        placeholder="Title, #, legacy ref, PO, or id…"
        className="min-w-[14rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-md"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={runSearch}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Search
      </button>
    </div>
  );
}
