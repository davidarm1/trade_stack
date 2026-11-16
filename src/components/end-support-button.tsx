"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { endSupportSession } from "@/actions/support";

export function EndSupportButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await endSupportSession();
        router.push("/admin/companies");
        router.refresh();
      }}
      className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
    >
      {busy ? "Ending…" : "End session"}
    </button>
  );
}
