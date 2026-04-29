"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { parsePayTab } from "@/lib/jobs-payment-buckets";

export function JobsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQueryString = searchParams.toString();
  const urlQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQ);

  useEffect(() => {
    setValue(urlQ);
  }, [urlQ]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = value.trim();
      if (next === urlQ.trim()) return;

      const p = new URLSearchParams(currentQueryString);
      if (next) p.set("q", next);
      else p.delete("q");
      if (!p.get("range")) p.set("range", "week");
      if (!p.get("pay")) p.set("pay", parsePayTab(undefined));
      const nextQueryString = p.toString();
      if (nextQueryString === currentQueryString) return;
      router.replace(`/jobs?${nextQueryString}`);
    }, 300);
    return () => clearTimeout(t);
  }, [value, urlQ, router, currentQueryString]);

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
        placeholder="Title, #, legacy ref, PO, or id…"
        className="min-w-[14rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-md"
        autoComplete="off"
      />
    </div>
  );
}
