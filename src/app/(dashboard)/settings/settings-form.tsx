"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateSettings } from "@/actions/settings";
import type { Tenant } from "@/types/database";

export function SettingsForm({
  tenant,
}: {
  tenant: Tenant | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const { error: err } = await updateSettings({
      name: String(form.get("name") ?? ""),
      address1: String(form.get("address1") ?? "") || null,
      address2: String(form.get("address2") ?? "") || null,
      town: String(form.get("town") ?? "") || null,
      postcode: String(form.get("postcode") ?? "") || null,
      phone: String(form.get("phone") ?? "") || null,
      email: String(form.get("email") ?? "") || null,
      default_vat_rate: form.get("default_vat_rate")
        ? Number(form.get("default_vat_rate"))
        : null,
      default_payment_terms_days: form.get("default_payment_terms_days")
        ? Number(form.get("default_payment_terms_days"))
        : null,
    });

    setPending(false);
    if (err) setError(err);
    else router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Company name
        </label>
        <input
          name="name"
          required
          defaultValue={tenant?.name ?? ""}
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
            defaultValue={tenant?.address1 ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Address line 2
          </label>
          <input
            name="address2"
            defaultValue={tenant?.address2 ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Town</label>
          <input
            name="town"
            defaultValue={tenant?.town ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Postcode
          </label>
          <input
            name="postcode"
            defaultValue={tenant?.postcode ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Phone</label>
          <input
            name="phone"
            defaultValue={tenant?.phone ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={tenant?.email ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Default VAT rate (%)
          </label>
          <input
            name="default_vat_rate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={tenant?.default_vat_rate ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Default payment terms (days)
          </label>
          <input
            name="default_payment_terms_days"
            type="number"
            min="0"
            defaultValue={tenant?.default_payment_terms_days ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Logo</label>
        <p className="mt-1 text-sm text-slate-500">
          {/* TODO: Upload to Supabase Storage, save public URL to tenants.logo_url */}
          Logo upload is not wired in this scaffold — add Storage bucket and policy.
        </p>
        <input type="file" accept="image/*" disabled className="mt-2 text-sm" />
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
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
