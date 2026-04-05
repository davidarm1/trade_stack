"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createJob } from "@/actions/jobs";

type ClientOpt = { id: string; company_name: string };
type UserOpt = { id: string; name: string | null };

export function NewJobForm({
  clients,
  engineers,
}: {
  clients: ClientOpt[];
  engineers: UserOpt[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const clientId = String(form.get("client_id") || "");
    const title = String(form.get("title") || "");
    const description = String(form.get("description") || "");
    const job_type = String(form.get("job_type") || "") || null;
    const assigned = String(form.get("assigned_engineer_id") || "");
    const date_onsite = String(form.get("date_onsite") || "") || null;
    const site_address1 = String(form.get("site_address1") || "") || null;
    const site_address2 = String(form.get("site_address2") || "") || null;
    const site_town = String(form.get("site_town") || "") || null;
    const site_postcode = String(form.get("site_postcode") || "") || null;
    const labour = form.get("labour_charge");
    const labour_charge =
      labour != null && String(labour) !== ""
        ? Number(labour)
        : null;
    const payment_terms = form.get("payment_terms_days");
    const payment_terms_days =
      payment_terms != null && String(payment_terms) !== ""
        ? Number(payment_terms)
        : null;

    const { data, error: err } = await createJob({
      client_id: clientId || null,
      title,
      description,
      job_type,
      assigned_engineer_id: assigned || null,
      date_onsite,
      site_address1,
      site_address2,
      site_town,
      site_postcode,
      labour_charge,
      payment_terms_days,
      status: "open",
    });

    setPending(false);
    if (err || !data) {
      setError(err ?? "Could not create job");
      return;
    }
    router.push(`/jobs/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Client
        </label>
        <select
          name="client_id"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Title
        </label>
        <input
          name="title"
          required
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
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Job type
        </label>
        <input
          name="job_type"
          placeholder="e.g. repair, install"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Assigned engineer
        </label>
        <select
          name="assigned_engineer_id"
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
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site address line 1
          </label>
          <input
            name="site_address1"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site address line 2
          </label>
          <input
            name="site_address2"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Town</label>
          <input
            name="site_town"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Postcode
          </label>
          <input
            name="site_postcode"
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
            step="0.01"
            min="0"
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
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Create job"}
        </button>
      </div>
    </form>
  );
}
