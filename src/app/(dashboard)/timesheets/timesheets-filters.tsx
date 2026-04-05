"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function TimesheetsFilters({ userOptions }: { userOptions: { id: string; name: string | null }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  function apply(next: { userId?: string; from?: string; to?: string }) {
    const params = new URLSearchParams();
    const u = next.userId !== undefined ? next.userId : userId;
    const f = next.from !== undefined ? next.from : from;
    const t = next.to !== undefined ? next.to : to;
    if (u) params.set("userId", u);
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    const q = params.toString();
    router.push(q ? `/timesheets?${q}` : "/timesheets");
  }

  return (
    <div className="mt-6 flex flex-wrap items-end gap-4">
      <div>
        <label htmlFor="userId" className="block text-xs text-slate-500">
          User
        </label>
        <select
          id="userId"
          value={userId}
          onChange={(e) => apply({ userId: e.target.value })}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All</option>
          {userOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.id}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="from" className="block text-xs text-slate-500">
          From
        </label>
        <input
          id="from"
          type="date"
          value={from}
          onChange={(e) => apply({ from: e.target.value })}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="to" className="block text-xs text-slate-500">
          To
        </label>
        <input
          id="to"
          type="date"
          value={to}
          onChange={(e) => apply({ to: e.target.value })}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
