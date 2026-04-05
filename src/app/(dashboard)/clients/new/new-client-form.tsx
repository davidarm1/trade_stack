"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/actions/clients";

export function NewClientForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const { data, error: err } = await createClient({
      company_name: String(form.get("company_name") ?? ""),
      address1: String(form.get("address1") ?? "") || null,
      address2: String(form.get("address2") ?? "") || null,
      town: String(form.get("town") ?? "") || null,
      postcode: String(form.get("postcode") ?? "") || null,
      contact_name: String(form.get("contact_name") ?? "") || null,
      contact_email: String(form.get("contact_email") ?? "") || null,
      contact_number: String(form.get("contact_number") ?? "") || null,
      site_address1: String(form.get("site_address1") ?? "") || null,
      site_address2: String(form.get("site_address2") ?? "") || null,
      site_town: String(form.get("site_town") ?? "") || null,
      site_postcode: String(form.get("site_postcode") ?? "") || null,
      payment_terms_days: form.get("payment_terms_days")
        ? Number(form.get("payment_terms_days"))
        : null,
      default_vat_exempt: form.get("default_vat_exempt") === "on",
      notes: String(form.get("notes") ?? "") || null,
      is_active: true,
    });

    setPending(false);
    if (err || !data) {
      setError(err ?? "Could not create client");
      return;
    }
    router.push("/clients");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Company name
        </label>
        <input
          name="company_name"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Address line 1
          </label>
          <input
            name="address1"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Address line 2
          </label>
          <input
            name="address2"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Town</label>
          <input
            name="town"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Postcode
          </label>
          <input
            name="postcode"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Contact name
          </label>
          <input
            name="contact_name"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Contact email
          </label>
          <input
            name="contact_email"
            type="email"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Contact number
          </label>
          <input
            name="contact_number"
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Default site address 1
          </label>
          <input
            name="site_address1"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Default site address 2
          </label>
          <input
            name="site_address2"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site town
          </label>
          <input
            name="site_town"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site postcode
          </label>
          <input
            name="site_postcode"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="default_vat_exempt"
          name="default_vat_exempt"
          type="checkbox"
          className="rounded border-slate-300"
        />
        <label
          htmlFor="default_vat_exempt"
          className="text-sm text-slate-700"
        >
          Default VAT exempt
        </label>
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
        {pending ? "Saving…" : "Create client"}
      </button>
    </form>
  );
}
