"use client";

import { useRouter } from "next/navigation";
import { deleteJob } from "@/actions/jobs";

const btnBase =
  "inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition-colors";

export function JobsRowActions({ jobId }: { jobId: string }) {
  const router = useRouter();

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

  return (
    <button
      type="button"
      onClick={() => void onDelete()}
      className={`${btnBase} border-red-200 bg-white text-red-700 hover:bg-red-50`}
      title="Delete job (soft delete)"
      aria-label="Delete job"
    >
      🗑
    </button>
  );
}
