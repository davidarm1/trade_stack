"use client";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

type Props = {
  jobId: string;
  /** Optional: must match session tenant if sent (server validates session). */
  tenantId?: string;
};

export function SignaturePad({ jobId, tenantId }: Props) {
  const padRef = useRef<SignatureCanvas>(null);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function clear() {
    padRef.current?.clear();
    setStatus("idle");
    setError(null);
    setSavedUrl(null);
  }

  async function confirm() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setError("Please sign in the box first.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("saving");
    const signatureDataUrl = pad.toDataURL("image/png");
    try {
      const res = await fetch(`/api/jobs/${jobId}/save-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          jobId,
          signatureDataUrl,
        }),
      });
      const data = (await res.json()) as { success?: boolean; url?: string; error?: string };
      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.error ?? "Could not save signature");
      }
      setSavedUrl(data.url);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setStatus("error");
    }
  }

  if (!mounted) {
    return (
      <div className="w-full min-h-[220px] rounded-lg border border-slate-200 bg-slate-50" />
    );
  }

  return (
    <div className="w-full max-w-lg space-y-4">
      <div className="w-full rounded-lg border-2 border-slate-300 bg-white touch-none">
        <SignatureCanvas
          ref={padRef}
          penColor="#0f172a"
          canvasProps={{
            className: "w-full h-[220px] sm:h-[260px] rounded-md",
            style: { width: "100%", height: "220px" },
          }}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <button
          type="button"
          onClick={clear}
          className="min-h-[48px] flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-800 shadow-sm active:bg-slate-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={status === "saving"}
          className="min-h-[48px] flex-1 rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white shadow active:bg-slate-800 disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Confirm"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {status === "done" && savedUrl && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            Signature saved.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={savedUrl}
            alt="Saved signature"
            className="mt-3 max-h-32 w-auto rounded border border-emerald-200 bg-white p-1"
          />
        </div>
      )}
    </div>
  );
}
