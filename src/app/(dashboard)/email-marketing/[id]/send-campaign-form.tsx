"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendCampaign } from "@/actions/email-marketing";
import type { EmailMarketingAudience } from "@/types/database";

export function SendCampaignForm({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [audience, setAudience] = useState<EmailMarketingAudience>("staff");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sentCount: number; failedCount: number } | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  async function handleSend() {
    setPending(true);
    setError(null);
    setResult(null);
    const { data, error: err } = await sendCampaign({ templateId, audience });
    setPending(false);
    setConfirming(false);
    if (err || !data) {
      setError(err ?? "Could not send campaign");
      return;
    }
    setResult({ sentCount: data.sentCount, failedCount: data.failedCount });
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Send this template</h2>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setAudience("staff")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            audience === "staff"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 text-slate-700"
          }`}
        >
          Staff
        </button>
        <button
          type="button"
          onClick={() => setAudience("clients")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            audience === "clients"
              ? "bg-slate-900 text-white"
              : "border border-slate-300 text-slate-700"
          }`}
        >
          Opted-in clients
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {audience === "staff"
          ? "Sends to every active team member's email — one email each."
          : "Sends only to clients with marketing_opt_in = true — one email each."}
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Send campaign
        </button>
      ) : (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            This sends a real email to every {audience === "staff" ? "active staff member" : "opted-in client"} now. Confirm?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={pending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Sending…" : "Yes, send now"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && (
        <p className="mt-2 text-sm text-emerald-700">
          Sent {result.sentCount}
          {result.failedCount > 0 ? `, ${result.failedCount} failed` : ""}.
        </p>
      )}
    </div>
  );
}
