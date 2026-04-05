"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function WagesFilters({
  userOptions,
}: {
  userOptions: { id: string; name: string | null }[];
}) {
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
    router.push(q ? `/wages?${q}` : "/wages");
  }

  return (
    <div className="mt-6 flex flex-wrap items-end gap-4">
      <div>
        <label htmlFor="wuserId" className="block text-xs text-slate-500">
          User
        </label>
        <select
          id="wuserId"
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
        <label htmlFor="wfrom" className="block text-xs text-slate-500">
          Period from
        </label>
        <input
          id="wfrom"
          type="date"
          value={from}
          onChange={(e) => apply({ from: e.target.value })}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="wto" className="block text-xs text-slate-500">
          Period to
        </label>
        <input
          id="wto"
          type="date"
          value={to}
          onChange={(e) => apply({ to: e.target.value })}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function badgeClass(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "approved")
    return "bg-emerald-100 text-emerald-900 border border-emerald-200";
  if (s === "rejected")
    return "bg-red-100 text-red-900 border border-red-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

export function ApprovalBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(status)}`}
    >
      {status ?? "—"}
    </span>
  );
}
