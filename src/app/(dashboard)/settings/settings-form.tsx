"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  removeTenantLogo,
  updateSettings,
  uploadTenantLogo,
  upsertSettingValue,
} from "@/actions/settings";
import {
  BRANDING_SHOW_COMPANY_NAME_KEY,
  BRANDING_SHOW_LOGO_KEY,
  BRANDING_USE_LOGO_LEGACY_KEY,
  resolveBrandingFromSettings,
} from "@/lib/branding-settings";
import type { Tenant } from "@/types/database";

const CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "GBP", label: "£ GBP — UK pound" },
  { value: "EUR", label: "€ EUR — Euro" },
  { value: "USD", label: "$ USD — US dollar" },
  { value: "AUD", label: "$ AUD — Australian dollar" },
  { value: "CAD", label: "$ CAD — Canadian dollar" },
  { value: "NZD", label: "$ NZD — New Zealand dollar" },
  { value: "CHF", label: "CHF — Swiss franc" },
  { value: "SEK", label: "SEK — Swedish krona" },
  { value: "NOK", label: "NOK — Norwegian krone" },
  { value: "DKK", label: "DKK — Danish krone" },
  { value: "PLN", label: "PLN — Polish złoty" },
  { value: "CZK", label: "CZK — Czech koruna" },
  { value: "HUF", label: "HUF — Hungarian forint" },
  { value: "RON", label: "RON — Romanian leu" },
  { value: "INR", label: "₹ INR — Indian rupee" },
];

const STANDARD_CURRENCY_CODES = new Set(CURRENCY_OPTIONS.map((o) => o.value));

export function SettingsForm({
  tenant,
  keyValues,
}: {
  tenant: Tenant | null;
  keyValues: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBust, setLogoBust] = useState(0);
  const [showNameBranding, setShowNameBranding] = useState(
    () => resolveBrandingFromSettings(keyValues).showName,
  );
  const [showLogoBranding, setShowLogoBranding] = useState(
    () => resolveBrandingFromSettings(keyValues).showLogo,
  );
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(
    () => Boolean(String(tenant?.vat_number ?? "").trim()) || Number(tenant?.default_vat_rate ?? 0) > 0,
  );

  useEffect(() => {
    const r = resolveBrandingFromSettings(keyValues);
    setShowNameBranding(r.showName);
    setShowLogoBranding(r.showLogo);
  }, [
    keyValues[BRANDING_SHOW_LOGO_KEY],
    keyValues[BRANDING_SHOW_COMPANY_NAME_KEY],
    keyValues[BRANDING_USE_LOGO_LEGACY_KEY],
  ]);

  useEffect(() => {
    setVatRegistered(
      Boolean(String(tenant?.vat_number ?? "").trim()) || Number(tenant?.default_vat_rate ?? 0) > 0,
    );
  }, [tenant?.vat_number, tenant?.default_vat_rate]);

  const savedCurrency = (() => {
    const c = (tenant?.currency ?? "GBP").trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c) ? c : "GBP";
  })();

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    setLogoError(null);
    setLogoBusy(true);
    const fd = new FormData();
    fd.append("file", f);
    const res = await uploadTenantLogo(fd);
    setLogoBusy(false);
    if (res.error) {
      setLogoError(res.error);
      return;
    }
    setLogoBust((n) => n + 1);
    router.refresh();
  }

  async function handleRemoveLogo() {
    if (!tenant?.logo_url) return;
    if (!window.confirm("Remove the company logo?")) return;
    setLogoError(null);
    setLogoBusy(true);
    const res = await removeTenantLogo();
    setLogoBusy(false);
    if (res.error) {
      setLogoError(res.error);
      return;
    }
    setShowLogoBranding(false);
    setLogoBust((n) => n + 1);
    router.refresh();
  }

  async function persistBrandingPatch(next: { showName: boolean; showLogo: boolean }) {
    if (!next.showName && !next.showLogo) {
      setLogoError("Keep at least one of company name or logo visible.");
      return;
    }
    setLogoError(null);
    setBrandingBusy(true);
    const [a, b] = await Promise.all([
      upsertSettingValue(BRANDING_SHOW_COMPANY_NAME_KEY, next.showName ? "true" : "false"),
      upsertSettingValue(BRANDING_SHOW_LOGO_KEY, next.showLogo ? "true" : "false"),
    ]);
    setBrandingBusy(false);
    const err = a.error ?? b.error;
    if (err) {
      setLogoError(err);
      return;
    }
    setShowNameBranding(next.showName);
    setShowLogoBranding(next.showLogo);
    router.refresh();
  }

  async function toggleShowCompanyName(next: boolean) {
    if (!next && !showLogoBranding) {
      setLogoError("Turn on the logo, or keep company name visible.");
      return;
    }
    await persistBrandingPatch({ showName: next, showLogo: showLogoBranding });
  }

  async function toggleShowLogo(next: boolean) {
    if (next && !tenant?.logo_url) {
      setLogoError("Upload a logo first.");
      return;
    }
    if (!next && !showNameBranding) {
      setLogoError("Turn on company name, or keep the logo visible.");
      return;
    }
    await persistBrandingPatch({ showName: showNameBranding, showLogo: next });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const currencyRaw = String(form.get("currency") ?? "").trim().toUpperCase();
    const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : "GBP";

    const { error: err } = await updateSettings({
      name: String(form.get("name") ?? ""),
      address1: String(form.get("address1") ?? "") || null,
      address2: String(form.get("address2") ?? "") || null,
      town: String(form.get("town") ?? "") || null,
      postcode: String(form.get("postcode") ?? "") || null,
      phone: String(form.get("phone") ?? "") || null,
      email: String(form.get("email") ?? "") || null,
      vat_number: vatRegistered ? String(form.get("vat_number") ?? "").trim() || null : null,
      default_vat_rate:
        vatRegistered && form.get("default_vat_rate")
          ? Number(form.get("default_vat_rate"))
          : 0,
      currency,
      default_payment_terms_days: form.get("default_payment_terms_days")
        ? Number(form.get("default_payment_terms_days"))
        : null,
      invoice_footer_text: String(form.get("invoice_footer_text") ?? "").trim() || null,
      bank_account_name: String(form.get("bank_account_name") ?? "").trim() || null,
      bank_name: String(form.get("bank_name") ?? "").trim() || null,
      bank_sort_code: String(form.get("bank_sort_code") ?? "").trim() || null,
      bank_account_number: String(form.get("bank_account_number") ?? "").trim() || null,
      bank_iban: String(form.get("bank_iban") ?? "").trim() || null,
      bank_swift: String(form.get("bank_swift") ?? "").trim() || null,
    });

    setPending(false);
    if (err) setError(err);
    else router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-5xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-900">Company profile</h2>
          <p className="mt-1 text-xs text-slate-500">
            Contact details used across the app and on printed documents.
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Company name</label>
            <input
              name="name"
              required
              defaultValue={tenant?.name ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Address line 1</label>
              <input
                name="address1"
                defaultValue={tenant?.address1 ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Address line 2</label>
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
              <label className="block text-sm font-medium text-slate-700">Postcode</label>
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
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-900">Invoice defaults</h2>
          <p className="mt-1 text-xs text-slate-500">
            These values appear on invoices and job-linked billing documents.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Currency</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Used for amounts across the app — quotes list, new quote, jobs, wages,
              receipts/outgoings.
            </p>
            <select
              name="currency"
              defaultValue={savedCurrency}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {!STANDARD_CURRENCY_CODES.has(savedCurrency) ? (
                <option value={savedCurrency}>Current: {savedCurrency}</option>
              ) : null}
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={vatRegistered}
                onChange={(e) => setVatRegistered(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block font-medium text-slate-900">VAT registered</span>
                <span className="block text-xs text-slate-500">
                  Turn this off only if the company is not VAT registered. When on, VAT number and default VAT rate stay available and VAT appears on invoices.
                </span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">VAT number</label>
                <input
                  name="vat_number"
                  defaultValue={tenant?.vat_number ?? ""}
                  disabled={!vatRegistered}
                  placeholder={vatRegistered ? "GB123456789" : "Not VAT registered"}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Default VAT rate (%)</label>
                <input
                  name="default_vat_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={tenant?.default_vat_rate ?? ""}
                  disabled={!vatRegistered}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
            </div>
            {!vatRegistered ? (
              <p className="text-xs text-slate-500">
                VAT is off for this company. Turn VAT registered back on to charge VAT on new invoices.
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Default payment terms (days)</label>
            <input
              name="default_payment_terms_days"
              type="number"
              min="0"
              defaultValue={tenant?.default_payment_terms_days ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Invoice footer text</label>
            <p className="mt-1 text-xs text-slate-500">
              Printed at the bottom of every invoice PDF. Use placeholders like
              ##company_name##, ##address##, ##bank_details##, ##email##, ##phone##,
              ##company_no##, ##vat_no##, ##payment_terms_days##, and
              ##payment_terms_sentence##. Defaults to “Thank you for your business.” if left blank.
            </p>
            <textarea
              name="invoice_footer_text"
              rows={3}
              defaultValue={tenant?.invoice_footer_text ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Bank details for invoices</h3>
            <p className="mt-1 text-xs text-slate-500">
              These details are pulled into invoices so clients know where to pay.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Account name</label>
              <input
                name="bank_account_name"
                defaultValue={tenant?.bank_account_name ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Bank name</label>
              <input
                name="bank_name"
                defaultValue={tenant?.bank_name ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Sort code</label>
              <input
                name="bank_sort_code"
                defaultValue={tenant?.bank_sort_code ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Account number</label>
              <input
                name="bank_account_number"
                defaultValue={tenant?.bank_account_number ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">IBAN</label>
              <input
                name="bank_iban"
                defaultValue={tenant?.bank_iban ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">SWIFT / BIC</label>
              <input
                name="bank_swift"
                defaultValue={tenant?.bank_swift ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-900">Branding</h2>
          <p className="mt-1 text-xs text-slate-500">
            Control whether the app sidebar and invoice headers show the company name and logo.
          </p>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={showNameBranding}
              disabled={brandingBusy}
              onChange={(e) => void toggleShowCompanyName(e.target.checked)}
            />
            <span>
              <span className="font-medium">Show company name</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                Used in the sidebar, mobile header, and invoice top header.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={showLogoBranding}
              disabled={brandingBusy || !tenant?.logo_url}
              onChange={(e) => void toggleShowLogo(e.target.checked)}
            />
            <span>
              <span className="font-medium">Show logo</span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                Turn on both checkboxes to show the logo and company name together.
              </span>
            </span>
          </label>
        </div>
        {tenant?.logo_url ? (
          <div className="mt-4 flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${tenant.logo_url}${tenant.logo_url.includes("?") ? "&" : "?"}cb=${logoBust}`}
              alt=""
              className="h-16 max-w-[200px] rounded border border-slate-200 bg-white object-contain p-1"
            />
            <div className="flex flex-col gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  disabled={logoBusy}
                  onChange={(e) => void handleLogoChange(e)}
                />
                {logoBusy ? "Uploading…" : "Replace logo"}
              </label>
              <button
                type="button"
                disabled={logoBusy}
                onClick={() => void handleRemoveLogo()}
                className="text-left text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                Remove logo
              </button>
            </div>
          </div>
        ) : (
          <label className="mt-4 inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={logoBusy}
              onChange={(e) => void handleLogoChange(e)}
            />
            {logoBusy ? "Uploading…" : "Upload logo"}
          </label>
        )}
        {logoError ? (
          <p className="mt-2 max-w-xl whitespace-pre-wrap break-words text-sm text-red-600" role="alert">
            {logoError}
          </p>
        ) : null}
      </section>

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
