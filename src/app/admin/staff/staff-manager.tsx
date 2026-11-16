"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { grantPlatformAdmin, revokePlatformAdmin } from "@/actions/support";

export function AddStaffForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const { error: err } = await grantPlatformAdmin(email);
    setBusy(false);
    if (err) return setError(err);
    setEmail("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email of an existing account"
          className="w-80 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || !email.trim()}
          onClick={() => void add()}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add platform admin"}
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function RemoveStaffButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Remove platform admin access for ${email}?`)) return;
          setBusy(true);
          const { error: err } = await revokePlatformAdmin(userId);
          setBusy(false);
          if (err) setError(err);
          else router.refresh();
        }}
        className="text-sm text-red-700 underline disabled:opacity-60"
      >
        Remove
      </button>
      {error ? <span className="ml-2 text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
