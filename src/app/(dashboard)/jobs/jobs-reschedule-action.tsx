"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rescheduleJob } from "@/actions/jobs";

const btnBase =
  "inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition-colors";

export function JobsRescheduleAction({
  jobId,
}: {
  jobId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btnBase} border-amber-200 bg-white text-amber-700 hover:bg-amber-50`}
        title="Reschedule job"
      >
        Reschedule
      </button>
    );
  }

  return (
    <form
      className="inline-flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const newDate = (fd.get("date") as string | null) ?? "";
        if (!newDate) return;
        startTransition(async () => {
          const { error } = await rescheduleJob(jobId, newDate);
          if (error) {
            alert(error);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <input
        type="date"
        name="date"
        defaultValue={today}
        min={today}
        autoFocus
        className="rounded border border-slate-300 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
      <button
        type="submit"
        disabled={pending}
        className={`${btnBase} border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50`}
        title="Confirm reschedule"
      >
        {pending ? "…" : "✓"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className={`${btnBase} border-slate-200 bg-white text-slate-500 hover:bg-slate-50`}
        title="Cancel"
      >
        ✕
      </button>
    </form>
  );
}
