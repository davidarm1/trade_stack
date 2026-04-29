"use client";

import { useState } from "react";
import type { JobAiPrefill } from "@/types/job-ai-prefill";
import { NewJobAiPanel } from "./new-job-ai-panel";
import { NewJobForm } from "./new-job-form";

type UserOpt = { id: string; name: string | null };

type EntryMode = "manual" | "ai";

export function NewJobEntry({ engineers }: { engineers: UserOpt[] }) {
  const [mode, setMode] = useState<EntryMode>("manual");
  const [aiPrefill, setAiPrefill] = useState<JobAiPrefill | null>(null);
  const [formKey, setFormKey] = useState(0);

  function handleAiParsed(prefill: JobAiPrefill) {
    setAiPrefill(prefill);
    setFormKey((k) => k + 1);
    setMode("manual");
  }

  return (
    <div className="mt-6">
      <div
        className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-1 shadow-sm"
        role="tablist"
        aria-label="How to add this job"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          id="tab-new-job-manual"
          aria-controls="panel-new-job-manual"
          onClick={() => setMode("manual")}
          className={
            mode === "manual"
              ? "rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200/80"
              : "rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          }
        >
          Enter manually
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ai"}
          id="tab-new-job-ai"
          aria-controls="panel-new-job-ai"
          onClick={() => setMode("ai")}
          className={
            mode === "ai"
              ? "rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200/80"
              : "rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          }
        >
          Add with AI
        </button>
      </div>

      <p className="mt-3 max-w-2xl text-sm text-slate-600">
        {mode === "manual" ? (
          <>
            Fill in the fields yourself — search or create the client, then add
            job details.
          </>
        ) : (
          <>
            Paste what the client sent by email or text, then use Parse with AI.
            Review and edit the form before creating the job.
          </>
        )}
      </p>

      <div
        id="panel-new-job-manual"
        role="tabpanel"
        aria-labelledby="tab-new-job-manual"
        hidden={mode !== "manual"}
      >
        <NewJobForm
          key={formKey}
          engineers={engineers}
          prefill={aiPrefill}
        />
      </div>

      <div
        id="panel-new-job-ai"
        role="tabpanel"
        aria-labelledby="tab-new-job-ai"
        hidden={mode !== "ai"}
      >
        <NewJobAiPanel onParsed={handleAiParsed} />
      </div>
    </div>
  );
}
