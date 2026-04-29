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

  useEffect(() => {
    const r = resolveBrandingFromSettings(keyValues);
    setShowNameBranding(r.showName);
    setShowLogoBranding(r.showLogo);
  }, [
    keyValues[BRANDING_SHOW_LOGO_KEY],
    keyValues[BRANDING_SHOW_COMPANY_NAME_KEY],
    keyValues[BRANDING_USE_LOGO_LEGACY_KEY],
  ]);

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
    const currency =
      /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : "GBP";

    const { error: err } = await updateSettings({
      name: String(form.get("name") ?? ""),
      address1: String(form.get("address1") ?? "") || null,
      address2: String(form.get("address2") ?? "") || null,
      town: String(form.get("town") ?? "") || null,
      postcode: String(form.get("postcode") ?? "") || null,
      phone: String(form.get("phone") ?? "") || null,
      email: String(form.get("email") ?? "") || null,
      currency,
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
            Currency
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Used for amounts across the app — quotes list, new quote, jobs, wages,
            receipts/outgoings (symbol follows ISO code, e.g. GBP → £).
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
        <p className="mt-1 text-xs text-slate-500">
          JPEG, PNG, WebP or GIF, up to 2&nbsp;MB. Branding options below apply to the app
          sidebar, mobile header, and the top of printed/HTML invoices only — not the From
          address block.
        </p>
        <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-xs font-medium text-slate-600">Branding</p>
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
                Sidebar, mobile header, and invoice top header only (not the From address).
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
                Same as above. Turn on both checkboxes to show logo and name together in those
                headers only.
              </span>
            </span>
          </label>
        </div>
        {tenant?.logo_url ? (
          <div className="mt-3 flex items-start gap-4">
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
          <label className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
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
          <p
            className="mt-2 max-w-xl whitespace-pre-wrap break-words text-sm text-red-600"
            role="alert"
          >
            {logoError}
          </p>
        ) : null}
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
