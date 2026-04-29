"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { convertQuoteToJob, softDeleteQuote } from "@/actions/quotes";

const btnBase =
  "inline-flex items-center justify-center rounded-md border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors";

export function QuoteRowActions({
  quoteId,
  status,
  bookedJobId,
}: {
  quoteId: string;
  status: string | null;
  bookedJobId: string | null;
}) {
  const router = useRouter();
  const booked = status === "booked";

  async function onBook() {
    if (!confirm("Create an open job from this quote?")) return;
    const r = await convertQuoteToJob(quoteId);
    if (r.error) alert(r.error);
    else if (r.data?.id) {
      router.push(`/jobs/${r.data.id}`);
      router.refresh();
    }
  }

  async function onDelete() {
    if (
      !confirm(
        "Archive this quote? It will disappear from the list (soft delete).",
      )
    )
      return;
    const r = await softDeleteQuote(quoteId);
    if (r.error) alert(r.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href={`/quotes/${quoteId}`}
        className={`${btnBase} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
      >
        Edit
      </Link>
      {booked ? (
        bookedJobId ? (
          <Link
            href={`/jobs/${bookedJobId}`}
            className={`${btnBase} border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`}
          >
            Job
          </Link>
        ) : (
          <span
            className={`${btnBase} cursor-default border-slate-200 bg-slate-50 text-slate-400 shadow-none`}
          >
            Booked
          </span>
        )
      ) : (
        <button
          type="button"
          onClick={() => void onBook()}
          className={`${btnBase} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Create job
        </button>
      )}
      <button
        type="button"
        onClick={() => void onDelete()}
        className={`${btnBase} border-red-200 bg-white text-red-800 hover:bg-red-50`}
      >
        Archive
      </button>
    </div>
  );
}
