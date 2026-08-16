"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptOnboardingDocument } from "@/actions/onboarding";

export function AcceptDocumentButton({
  documentId,
  version,
}: {
  documentId: string;
  version: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending(true);
    setError(null);
    const { error: err } = await acceptOnboardingDocument(documentId, version);
    setPending(false);
    if (err) {
      setError(err);
      return;
    }
    router.refresh();
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={handleAccept}
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Accepting…" : "Accept"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
