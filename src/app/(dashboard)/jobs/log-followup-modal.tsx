"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logFollowUp, type ContactMethod, type FollowupStatus } from "@/actions/contact-log";

const METHODS: { value: ContactMethod; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "in_person", label: "In person" },
  { value: "letter", label: "Letter" },
  { value: "other", label: "Other" },
];

const STATUSES: { value: FollowupStatus; label: string }[] = [
  { value: "chased", label: "Followed up" },
  { value: "awaiting_reply", label: "Awaiting reply" },
  { value: "promised_payment", label: "Promised payment" },
  { value: "dispute", label: "In dispute" },
  { value: "escalated", label: "Escalated to owner" },
  { value: "resolved", label: "Resolved" },
];

export function LogFollowUpModal({
  jobId,
  jobTitle,
}: {
  jobId: string;
  jobTitle: string | null;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [method, setMethod] = useState<ContactMethod>("phone");
  const [status, setStatus] = useState<FollowupStatus>("chased");
  const [outcome, setOutcome] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setMethod("phone");
    setStatus("chased");
    setOutcome("");
    setNextActionDate("");
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "promised_payment" && !nextActionDate) {
      setError("Next action date is required when status is Promised payment.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await logFollowUp({
      jobId,
      contactMethod: method,
      status,
      outcome: outcome || null,
      nextActionDate: nextActionDate || null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        title="Log follow-up for this job"
      >
        Log follow-up
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Log follow-up</h2>
            {jobTitle ? (
              <p className="mt-0.5 text-sm text-slate-500 truncate">{jobTitle}</p>
            ) : null}
          </div>

          <div className="space-y-4 px-5 py-4">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`fm-method-${jobId}`}>
                Method
              </label>
              <select
                id={`fm-method-${jobId}`}
                value={method}
                onChange={(e) => setMethod(e.target.value as ContactMethod)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`fm-status-${jobId}`}>
                Status
              </label>
              <select
                id={`fm-status-${jobId}`}
                value={status}
                onChange={(e) => setStatus(e.target.value as FollowupStatus)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`fm-outcome-${jobId}`}>
                Outcome <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id={`fm-outcome-${jobId}`}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                rows={3}
                placeholder="e.g. Spoke to Sharon, promised payment by Friday"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`fm-date-${jobId}`}>
                Next action date{" "}
                {status === "promised_payment" ? (
                  <span className="text-red-600">*</span>
                ) : (
                  <span className="font-normal text-slate-400">(optional)</span>
                )}
              </label>
              <input
                id={`fm-date-${jobId}`}
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                required={status === "promised_payment"}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none"
              />
            </div>

            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
