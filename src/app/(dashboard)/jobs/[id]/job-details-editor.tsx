"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateJob } from "@/actions/jobs";

type Initial = {
  title: string;
  description: string;
  date_onsite: string;
  time_onsite: string;
};

/**
 * Inline editor for the fields the AI job parser (or a person) most often
 * gets wrong or leaves blank — title, description, date/time onsite. These
 * previously had no on-page way to fix: only the separate /edit page
 * touched them, several steps away from where the job sheet preview shows
 * the mistake.
 */
export function JobDetailsEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setFields(initial);
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await updateJob(jobId, {
      title: fields.title.trim() || "Job",
      description: fields.description.trim() || null,
      date_onsite: fields.date_onsite.trim() || null,
      time_onsite: fields.time_onsite.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Edit job details
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">
          Title
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={fields.title}
            onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="text-xs text-slate-600">
          Date onsite
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={fields.date_onsite}
            onChange={(e) => setFields((f) => ({ ...f, date_onsite: e.target.value }))}
          />
        </label>
        <label className="text-xs text-slate-600">
          Time onsite
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="e.g. 2pm, or 9-11am"
            value={fields.time_onsite}
            onChange={(e) => setFields((f) => ({ ...f, time_onsite: e.target.value }))}
          />
        </label>
      </div>
      <label className="block text-xs text-slate-600">
        Description
        <textarea
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          value={fields.description}
          onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
        />
      </label>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setFields(initial);
            setEditing(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
