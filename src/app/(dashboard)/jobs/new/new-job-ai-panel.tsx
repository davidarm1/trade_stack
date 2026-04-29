"use client";

import { useState } from "react";
import type { JobAiPrefill } from "@/types/job-ai-prefill";

type Props = {
  onParsed: (prefill: JobAiPrefill) => void;
};

export function NewJobAiPanel({ onParsed }: Props) {
  const [rawMessage, setRawMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleParse() {
    setError(null);
    const text = rawMessage.trim();
    if (text.length < 8) {
      setError("Paste a bit more detail so the model can infer a job title.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/jobs/parse-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { prefill?: JobAiPrefill; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Request failed.");
        return;
      }
      if (!data.prefill) {
        setError("No structured data returned.");
        return;
      }
      onParsed(data.prefill);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 max-w-2xl space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Message from client
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          When a client emails or texts job details, paste the full message
          here. We will send it to OpenAI and map the reply into the job form
          (review before saving).
        </p>
        <label htmlFor="job-ai-raw" className="sr-only">
          Pasted email or text
        </label>
        <textarea
          id="job-ai-raw"
          value={rawMessage}
          onChange={(e) => setRawMessage(e.target.value)}
          rows={14}
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Paste the client’s email or text message here…"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleParse()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Parsing…" : "Parse with AI"}
          </button>
          <p className="text-xs text-slate-500">
            Opens the manual tab with fields filled — always verify before
            creating the job.
          </p>
        </div>
        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
