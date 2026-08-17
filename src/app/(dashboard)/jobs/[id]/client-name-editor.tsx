"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateClient } from "@/actions/clients";

export function ClientNameEditor({
  clientId,
  clientName,
}: {
  clientId: string | null;
  clientName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(clientName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (!clientId || busy) return;
    setBusy(true);
    setMsg(null);
    const nextName = value.trim() || clientName || "Client";
    const { error } = await updateClient(clientId, { company_name: nextName });
    setBusy(false);
    if (error) {
      setMsg(error);
      return;
    }
    setEditing(false);
    setMsg("Saved.");
    router.refresh();
  }

  if (!clientId) {
    return <span>{clientName}</span>;
  }

  return (
    <div className="space-y-2">
      {editing ? (
        <div className="space-y-2">
          <input
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
              onClick={() => void save()}
              disabled={busy}
            >
              {busy ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              onClick={() => {
                setValue(clientName);
                setEditing(false);
                setMsg(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-900">{clientName}</span>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            onClick={() => {
              setValue(clientName);
              setEditing(true);
              setMsg(null);
            }}
          >
            Edit
          </button>
        </div>
      )}
      {msg ? <p className="text-xs text-slate-500">{msg}</p> : null}
    </div>
  );
}
