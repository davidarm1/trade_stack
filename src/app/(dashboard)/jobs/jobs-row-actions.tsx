"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteJob, duplicateJob } from "@/actions/jobs";

const btnBase =
  "inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition-colors";

export function JobsRowActions({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);

  async function onDelete() {
    if (
      !confirm(
        "Delete this job from the list? It will be soft deleted and remain in the database for audit/history.",
      )
    ) {
      return;
    }
    const r = await deleteJob(jobId);
    if (r.error) {
      alert(r.error);
      return;
    }
    router.refresh();
  }

  async function onDuplicate() {
    if (copying) return;
    setCopying(true);
    const r = await duplicateJob(jobId);
    setCopying(false);
    if (r.error || !r.data) {
      alert(r.error ?? "Could not duplicate job");
      return;
    }
    router.push(`/jobs/${r.data.id}`);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void onDuplicate()}
        disabled={copying}
        className={`${btnBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60`}
        title="Duplicate job — for recurring work, set the date and assign an engineer on the copy"
        aria-label="Duplicate job"
      >
        {copying ? "…" : "⧉"}
      </button>
      <button
        type="button"
        onClick={() => void onDelete()}
        className={`${btnBase} border-red-200 bg-white text-red-700 hover:bg-red-50`}
        title="Delete job (soft delete)"
        aria-label="Delete job"
      >
        🗑
      </button>
    </div>
  );
}
