"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateJob } from "@/actions/jobs";

type EngineerOption = { id: string; name: string | null };

type EditJobInitial = {
  id: string;
  title: string | null;
  description: string | null;
  job_type: string | null;
  status: string | null;
  assigned_engineer_id: string | null;
  date_onsite: string | null;
  site_address1: string | null;
  site_address2: string | null;
  site_town: string | null;
  site_postcode: string | null;
  labour_charge: number | null;
  payment_terms_days: number | null;
  custom_po_number: string | null;
  legacy_ref: string | null;
  invoice_sent_at: string | null;
};

const STATUS_OPTIONS = [
  "open",
  "in_progress",
  "scheduled",
  "completed",
  "cancelled",
  "invoiced",
];

export function EditJobForm({
  initial,
  engineers,
}: {
  initial: EditJobInitial;
  engineers: EngineerOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const asText = (key: string) => String(form.get(key) ?? "").trim();
    const asNullableText = (key: string) => asText(key) || null;
    const asNullableNumber = (key: string) => {
      const raw = asText(key);
      return raw === "" ? null : Number(raw);
    };

    const title = asText("title");
    if (!title) {
      setPending(false);
      setError("Title is required.");
      return;
    }

    const { error: updateErr } = await updateJob(initial.id, {
      title,
      description: asNullableText("description"),
      status: asNullableText("status"),
      assigned_engineer_id: asNullableText("assigned_engineer_id"),
      date_onsite: asNullableText("date_onsite"),
      site_address1: asNullableText("site_address1"),
      site_address2: asNullableText("site_address2"),
      site_town: asNullableText("site_town"),
      site_postcode: asNullableText("site_postcode"),
      labour_charge: asNullableNumber("labour_charge"),
      payment_terms_days: asNullableNumber("payment_terms_days"),
      custom_po_number: asNullableText("custom_po_number"),
      legacy_ref: asNullableText("legacy_ref"),
    });

    setPending(false);
    if (updateErr) {
      setError(updateErr);
      return;
    }

    router.push(`/jobs/${initial.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-2xl space-y-4">
      {initial.invoice_sent_at ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Warning: this job is already at Invoice Sent. Editing financial fields may
          require sending a new invoice version.
        </div>
      ) : null}
      <div>
        <label className="block text-sm font-medium text-slate-700">Title</label>
        <input
          name="title"
          required
          defaultValue={initial.title ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          name="description"
          rows={4}
          defaultValue={initial.description ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Status
        </label>
        <select
          name="status"
          defaultValue={initial.status ?? "open"}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Assigned engineer
          </label>
          <select
            name="assigned_engineer_id"
            defaultValue={initial.assigned_engineer_id ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {engineers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Date onsite
          </label>
          <input
            name="date_onsite"
            type="date"
            defaultValue={initial.date_onsite ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site address line 1
          </label>
          <input
            name="site_address1"
            defaultValue={initial.site_address1 ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site address line 2
          </label>
          <input
            name="site_address2"
            defaultValue={initial.site_address2 ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Town</label>
          <input
            name="site_town"
            defaultValue={initial.site_town ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Postcode
          </label>
          <input
            name="site_postcode"
            defaultValue={initial.site_postcode ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Labour charge
          </label>
          <input
            name="labour_charge"
            type="number"
            min="0"
            step="0.01"
            defaultValue={
              initial.labour_charge != null ? String(initial.labour_charge) : ""
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Payment terms (days)
          </label>
          <input
            name="payment_terms_days"
            type="number"
            min="0"
            defaultValue={
              initial.payment_terms_days != null
                ? String(initial.payment_terms_days)
                : ""
            }
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            PO number
          </label>
          <input
            name="custom_po_number"
            defaultValue={initial.custom_po_number ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Legacy ref
          </label>
          <input
            name="legacy_ref"
            defaultValue={initial.legacy_ref ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
