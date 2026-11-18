"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient, updateClient } from "@/actions/clients";
import type { Client } from "@/types/database";

export function NewClientForm({ client }: { client?: Client }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function copyBillingToSite() {
    const f = formRef.current;
    if (!f) return;
    for (const [from, to] of [
      ["address1", "site_address1"],
      ["address2", "site_address2"],
      ["town", "site_town"],
      ["postcode", "site_postcode"],
    ]) {
      (f.elements.namedItem(to) as HTMLInputElement).value = (
        f.elements.namedItem(from) as HTMLInputElement
      ).value;
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const payload = {
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
      marketing_opt_in: form.get("marketing_opt_in") === "on",
      marketing_opted_in_at:
        form.get("marketing_opt_in") !== "on"
          ? null
          : client?.marketing_opt_in
            ? client.marketing_opted_in_at
            : new Date().toISOString(),
    };

    const { data, error: err } = client
      ? await updateClient(client.id, payload)
      : await createClient({ ...payload, is_active: true });

    setPending(false);
    if (err || !data) {
      setError(err ?? "Could not save client");
      return;
    }
    router.push("/clients");
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Company name
        </label>
        <input
          name="company_name"
          defaultValue={client?.company_name ?? ""}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <legend className="px-2 text-sm font-semibold text-slate-900">Billing address</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">Where invoices are sent. This is the client&apos;s registered or office address.</p>
        </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Address line 1
          </label>
          <input
            name="address1"
            defaultValue={client?.address1 ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Address line 2
          </label>
          <input
            name="address2"
            defaultValue={client?.address2 ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Town</label>
          <input
            name="town"
            defaultValue={client?.town ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Postcode
          </label>
          <input
            name="postcode"
            defaultValue={client?.postcode ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Contact name
          </label>
          <input
            name="contact_name"
            defaultValue={client?.contact_name ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Contact email
          </label>
          <input
            name="contact_email"
            defaultValue={client?.contact_email ?? ""}
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
            defaultValue={client?.contact_number ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Payment terms (days)
          </label>
          <input
            name="payment_terms_days"
            defaultValue={client?.payment_terms_days ?? ""}
            type="number"
            min="0"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <fieldset className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <legend className="px-2 text-sm font-semibold text-slate-900">Default site address</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">Where the work is normally carried out. Leave blank if it is the same as the billing address.</p>
          <button
            type="button"
            onClick={copyBillingToSite}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Copy from billing address
          </button>
        </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Default site address 1
          </label>
          <input
            name="site_address1"
            defaultValue={client?.site_address1 ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Default site address 2
          </label>
          <input
            name="site_address2"
            defaultValue={client?.site_address2 ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site town
          </label>
          <input
            name="site_town"
            defaultValue={client?.site_town ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site postcode
          </label>
          <input
            name="site_postcode"
            defaultValue={client?.site_postcode ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      </fieldset>
      <div className="flex items-center gap-2">
        <input
          id="default_vat_exempt"
          name="default_vat_exempt"
          defaultChecked={client?.default_vat_exempt ?? false}
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
      <div className="flex items-center gap-2">
        <input
          id="marketing_opt_in"
          name="marketing_opt_in"
          defaultChecked={client?.marketing_opt_in ?? false}
          type="checkbox"
          className="rounded border-slate-300"
        />
        <label htmlFor="marketing_opt_in" className="text-sm text-slate-700">
          Opted in to marketing email (confirmed with the client — required
          before they can receive any Email Marketing send)
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">Notes</label>
        <textarea
          name="notes"
          defaultValue={client?.notes ?? ""}
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
        {pending ? "Saving…" : client ? "Save changes" : "Create client"}
      </button>
    </form>
  );
}
