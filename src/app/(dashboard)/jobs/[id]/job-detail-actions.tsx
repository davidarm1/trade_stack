"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateJob } from "@/actions/jobs";

export function JobDetailActions({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function patch(partial: Record<string, unknown>) {
    setMsg(null);
    const { error } = await updateJob(jobId, partial as never);
    if (error) setMsg(error);
    else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() => {
            // TODO: Navigate to edit form or open modal with full job editor.
            setMsg("Edit flow not wired — add an edit route or modal.");
          }}
        >
          Edit
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() =>
            patch({
              sent_to_engineer_at: new Date().toISOString(),
            })
          }
        >
          Send to Engineer
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() =>
            patch({
              approved_at: new Date().toISOString(),
            })
          }
        >
          Approve
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() =>
            patch({
              invoice_sent_at: new Date().toISOString(),
            })
          }
        >
          Send Invoice
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() =>
            patch({
              invoice_paid_at: new Date().toISOString(),
              payment_status: "paid",
            })
          }
        >
          Mark Paid
        </button>
      </div>
      {msg && <p className="text-sm text-amber-800">{msg}</p>}
    </div>
  );
}
