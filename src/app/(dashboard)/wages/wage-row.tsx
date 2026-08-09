"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  applyTravelPayToWage,
  getApprovedTravelHours,
} from "@/actions/wages";
import { formatCurrency } from "@/lib/format-currency";
import { ApprovalBadge } from "./wages-filters";

type WageRowData = {
  id: string;
  period_date?: string | null;
  user_id?: string | null;
  total_wage?: number | null;
  travel_wage?: number | null;
  approval_status?: string | null;
};

export function WageRow({
  wage,
  userName,
  currencyCode,
}: {
  wage: WageRowData;
  userName: string;
  currencyCode: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  async function checkHours() {
    if (!wage.user_id || !periodFrom || !periodTo) return;
    setChecking(true);
    setError(null);
    setPreview(null);
    const { data, error: err } = await getApprovedTravelHours(
      wage.user_id,
      periodFrom,
      periodTo,
    );
    setChecking(false);
    if (err || data == null) {
      setError(err ?? "Could not total travel hours");
      return;
    }
    setPreview(data);
  }

  async function apply() {
    if (!periodFrom || !periodTo) return;
    setApplying(true);
    setError(null);
    const { error: err } = await applyTravelPayToWage(
      wage.id,
      periodFrom,
      periodTo,
    );
    setApplying(false);
    if (err) {
      setError(err);
      return;
    }
    setExpanded(false);
    setPreview(null);
    router.refresh();
  }

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3 text-slate-700">
          {wage.period_date
            ? new Date(wage.period_date).toLocaleDateString()
            : "—"}
        </td>
        <td className="px-4 py-3 text-slate-700">{userName}</td>
        <td className="px-4 py-3 tabular-nums text-slate-700">
          {wage.total_wage != null
            ? formatCurrency(wage.total_wage, currencyCode)
            : "—"}
        </td>
        <td className="px-4 py-3">
          <ApprovalBadge status={wage.approval_status} />
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sm font-medium text-slate-700 underline"
          >
            {expanded ? "Close" : "Travel pay"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-slate-50 px-4 py-4">
            <div className="max-w-md space-y-3">
              <p className="text-xs text-slate-600">
                Sums <strong>approved</strong> timesheets&apos; travel hours
                for this user in the range below, at their travel_rate, and
                tops up this wage record&apos;s travel_wage + total_wage.
                Current travel pay on this record:{" "}
                {wage.travel_wage != null
                  ? formatCurrency(wage.travel_wage, currencyCode)
                  : "none yet"}
                .
              </p>
              <div className="flex gap-3">
                <div>
                  <label className="block text-xs text-slate-500">From</label>
                  <input
                    type="date"
                    value={periodFrom}
                    onChange={(e) => setPeriodFrom(e.target.value)}
                    className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">To</label>
                  <input
                    type="date"
                    value={periodTo}
                    onChange={(e) => setPeriodTo(e.target.value)}
                    className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void checkHours()}
                  disabled={!periodFrom || !periodTo || checking}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {checking ? "Checking…" : "Preview hours"}
                </button>
                {preview != null && (
                  <span className="text-sm text-slate-700">
                    {preview} approved travel hour{preview === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={() => void apply()}
                disabled={!periodFrom || !periodTo || applying}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {applying ? "Applying…" : "Apply travel pay to this record"}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
