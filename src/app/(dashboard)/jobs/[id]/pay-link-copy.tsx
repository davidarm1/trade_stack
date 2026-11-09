"use client";

import { useState } from "react";

export function PayLinkCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard unavailable: the field above can still be selected */
          }
        }}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
