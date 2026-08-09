"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upsertSettingValue } from "@/actions/settings";
import {
  DEPOT_POSTCODE_KEY,
  TRAVEL_DISTANCE_THRESHOLD_MILES_KEY,
} from "@/lib/travel-distance-settings";

/**
 * Separate from any client-facing travel/pricing settings (there are
 * none in this codebase) — this only controls when an engineer's
 * self-reported travel hours count toward Wages > travel pay. See
 * src/actions/wages.ts (getApprovedTravelHours) and
 * src/lib/postcode-distance.ts.
 */
export function TravelPaySettings({
  keyValues,
}: {
  keyValues: Record<string, string>;
}) {
  const router = useRouter();
  const [depotPostcode, setDepotPostcode] = useState(
    keyValues[DEPOT_POSTCODE_KEY] ?? "",
  );
  const [thresholdMiles, setThresholdMiles] = useState(
    keyValues[TRAVEL_DISTANCE_THRESHOLD_MILES_KEY] ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    const [a, b] = await Promise.all([
      upsertSettingValue(DEPOT_POSTCODE_KEY, depotPostcode.trim()),
      upsertSettingValue(TRAVEL_DISTANCE_THRESHOLD_MILES_KEY, thresholdMiles.trim()),
    ]);
    setPending(false);
    const err = a.error ?? b.error;
    if (err) {
      setError(err);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        Engineer travel pay — distance rule
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        Optional. If both fields are set, an approved visit&apos;s travel
        hours only count toward Wages &gt; travel pay when the job site is
        at or beyond this distance from the depot. Leave either blank to
        pay out all approved travel hours regardless of distance.
        Straight-line distance via UK postcode, not driving distance.
      </p>
      <form onSubmit={handleSave} className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-slate-500">Depot postcode</label>
          <input
            value={depotPostcode}
            onChange={(e) => setDepotPostcode(e.target.value)}
            placeholder="e.g. G1 1AA"
            className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">
            Distance threshold (miles)
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={thresholdMiles}
            onChange={(e) => setThresholdMiles(e.target.value)}
            placeholder="e.g. 10"
            className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved.</span>}
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
