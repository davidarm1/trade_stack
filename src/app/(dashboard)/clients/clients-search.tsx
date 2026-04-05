"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function ClientsSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const q = searchParams.get("q") ?? "";

  return (
    <div className="mt-6 flex max-w-md items-center gap-2">
      <label htmlFor="q" className="sr-only">
        Search clients
      </label>
      <input
        id="q"
        type="search"
        defaultValue={q}
        placeholder="Search company or contact…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        onChange={(e) => {
          const v = e.target.value;
          startTransition(() => {
            router.push(v ? `/clients?q=${encodeURIComponent(v)}` : "/clients");
          });
        }}
      />
      {pending && (
        <span className="text-xs text-slate-500" aria-hidden>
          …
        </span>
      )}
    </div>
  );
}
