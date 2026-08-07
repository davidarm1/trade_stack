"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createVehicle } from "@/actions/vehicles";

export function NewVehicleForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const { data, error: err } = await createVehicle({
      registration: String(form.get("registration") ?? ""),
      make_model: String(form.get("make_model") ?? "") || null,
      mot_due_date: String(form.get("mot_due_date") ?? "") || null,
      insurance_renewal_date:
        String(form.get("insurance_renewal_date") ?? "") || null,
      notes: String(form.get("notes") ?? "") || null,
      is_active: true,
    });

    setPending(false);
    if (err || !data) {
      setError(err ?? "Could not create vehicle");
      return;
    }
    router.push(`/vans/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Registration
        </label>
        <input
          name="registration"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Make / model
        </label>
        <input
          name="make_model"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            MOT due date
          </label>
          <input
            name="mot_due_date"
            type="date"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Insurance renewal date
          </label>
          <input
            name="insurance_renewal_date"
            type="date"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Notes</label>
        <textarea
          name="notes"
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Create vehicle"}
      </button>
    </form>
  );
}
