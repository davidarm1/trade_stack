"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createQuote } from "@/actions/quotes";
import { getClients, searchClients } from "@/actions/clients";
import { formatCurrency } from "@/lib/format-currency";
import {
  QUOTES_VALID_DAYS,
  addDaysToLocalIsoDate,
  entryDayQuotePeriod,
} from "@/lib/quote-form-dates";
import type { Client } from "@/types/database";

type QuotePrefill = {
  title?: string;
  description?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  address1?: string;
  address2?: string;
  town?: string;
  postcode?: string;
  quote_date?: string | null;
  expires_at?: string | null;
  price_hint?: number | null;
  office_sales_pitch?: string | null;
};

export function NewQuoteForm({ currencyCode }: { currencyCode: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);

  const [rawRequest, setRawRequest] = useState("");
  const [prefill, setPrefill] = useState<QuotePrefill | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [town, setTown] = useState("");
  const [postcode, setPostcode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quoteDate, setQuoteDate] = useState(() => entryDayQuotePeriod().quoteDate);
  const [expiresAt, setExpiresAt] = useState(() => entryDayQuotePeriod().expiresAt);
  const [officeSalesPitch, setOfficeSalesPitch] = useState("");

  const [clientQuery, setClientQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allClientsLoaded, setAllClientsLoaded] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(clientQuery), 250);
    return () => clearTimeout(t);
  }, [clientQuery]);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestionsLoading(true);
    searchClients(debouncedQuery).then((res) => {
      if (cancelled) return;
      setSuggestionsLoading(false);
      if (res.error || !res.data) {
        setSuggestions([]);
        return;
      }
      setSuggestions(res.data);
      setDropdownOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const chooseClient = useCallback((c: Client) => {
    setSelectedClientId(c.id);
    setClientQuery(c.company_name);
    setCustomerName(c.contact_name || c.company_name || "");
    setCustomerEmail(c.contact_email || "");
    setCustomerPhone(c.contact_number || "");
    setAddress1(c.address1 || "");
    setAddress2(c.address2 || "");
    setTown(c.town || "");
    setPostcode(c.postcode || "");
    setDropdownOpen(false);
    setSuggestions([]);
  }, []);

  useEffect(() => {
    if (!prefill) return;
    setCustomerName(prefill.customer_name ?? "");
    setCustomerEmail(prefill.customer_email ?? "");
    setCustomerPhone(prefill.customer_phone ?? "");
    setAddress1(prefill.address1 ?? "");
    setAddress2(prefill.address2 ?? "");
    setTown(prefill.town ?? "");
    setPostcode(prefill.postcode ?? "");
    setTitle(prefill.title ?? "");
    setDescription(prefill.description ?? "");
    setPrice(
      prefill.price_hint != null ? String(prefill.price_hint) : "",
    );
    const period = entryDayQuotePeriod();
    setQuoteDate(period.quoteDate);
    setExpiresAt(period.expiresAt);
    setOfficeSalesPitch(
      prefill.office_sales_pitch?.trim() ? prefill.office_sales_pitch : "",
    );
  }, [prefill]);

  async function openClientDropdown() {
    setError(null);
    if (!allClientsLoaded) {
      setSuggestionsLoading(true);
      const res = await getClients();
      setSuggestionsLoading(false);
      if (res.error || !res.data) {
        setSuggestions([]);
        setAllClients([]);
        setAllClientsLoaded(false);
        if (res.error) setError(res.error);
        setDropdownOpen(true);
        return;
      }
      setAllClients(res.data as Client[]);
      setAllClientsLoaded(true);
      if (clientQuery.trim().length < 2) {
        setSuggestions(res.data as Client[]);
      }
    } else if (clientQuery.trim().length < 2) {
      setSuggestions(allClients);
    }
    setDropdownOpen(true);
  }

  async function handleAiPrefill() {
    setError(null);
    const text = rawRequest.trim();
    if (text.length < 8) {
      setError("Paste a longer quote request for AI to parse.");
      return;
    }
    setAiPending(true);
    try {
      const res = await fetch("/api/quotes/parse-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        prefill?: QuotePrefill;
        error?: string;
      };
      if (!res.ok || !data.prefill) {
        setError(data.error ?? "AI could not parse this quote request.");
        return;
      }
      setPrefill(data.prefill);
      if (data.prefill.customer_name && clientQuery.trim() === "") {
        setClientQuery(data.prefill.customer_name);
      }
      setMode("manual");
    } catch {
      setError("Network error while calling AI parse.");
    } finally {
      setAiPending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);

    const titleValue = String(form.get("title") ?? "").trim();
    const descriptionValue = String(form.get("description") ?? "").trim();
    const customerNameValue = String(form.get("customer_name") ?? "").trim();
    const customerEmailValue = String(form.get("customer_email") ?? "").trim();
    const customerPhoneValue = String(form.get("customer_phone") ?? "").trim();
    const address1Value = String(form.get("address1") ?? "").trim();
    const address2Value = String(form.get("address2") ?? "").trim();
    const townValue = String(form.get("town") ?? "").trim();
    const postcodeValue = String(form.get("postcode") ?? "").trim();
    const quoteDateValue = String(form.get("quote_date") ?? "").trim();
    const expiresAtValue = String(form.get("expires_at") ?? "").trim();
    const priceRaw = String(form.get("price") ?? "").trim();

    const { error: createErr } = await createQuote({
      client_id: selectedClientId || null,
      customer_name: customerNameValue || null,
      customer_email: customerEmailValue || null,
      customer_phone: customerPhoneValue || null,
      address1: address1Value || null,
      address2: address2Value || null,
      town: townValue || null,
      postcode: postcodeValue || null,
      title: titleValue || null,
      description: descriptionValue || null,
      quote_date: quoteDateValue || null,
      expires_at: expiresAtValue || null,
      price: priceRaw ? Number(priceRaw) : null,
    });

    setPending(false);
    if (createErr) {
      setError(createErr);
      return;
    }
    router.push("/quotes");
    router.refresh();
  }

  return (
    <div className="mt-6 max-w-3xl space-y-4">
      <div
        className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-1 shadow-sm"
        role="tablist"
        aria-label="Quote entry mode"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          onClick={() => setMode("manual")}
          className={
            mode === "manual"
              ? "rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200/80"
              : "rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          }
        >
          Manual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ai"}
          onClick={() => setMode("ai")}
          className={
            mode === "ai"
              ? "rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm ring-1 ring-slate-200/80"
              : "rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          }
        >
          AI
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div
        role="tabpanel"
        hidden={mode !== "ai"}
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-900">AI quote request</h2>
        <p className="mt-1 text-xs text-slate-600">
          Paste a customer request to prefill the manual form. Initial price uses
          the same <span className="font-medium">AI pricing master prompt</span> as
          the Quotes page.
        </p>
        <textarea
          value={rawRequest}
          onChange={(e) => setRawRequest(e.target.value)}
          rows={6}
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Paste customer request email/text..."
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleAiPrefill()}
            disabled={aiPending}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {aiPending ? "Parsing..." : "Parse request with AI"}
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Back to manual form
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        hidden={mode !== "manual"}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        aria-hidden={mode !== "manual"}
      >
        <div ref={wrapRef} className="relative">
          <label className="block text-sm font-medium text-slate-700">Match existing client (optional)</label>
          <div className="mt-1 flex items-stretch rounded-md border border-slate-300">
            <input
              type="text"
              value={clientQuery}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setSelectedClientId(null);
                setDropdownOpen(e.target.value.trim().length >= 2);
              }}
              onFocus={() => {
                if (clientQuery.trim().length >= 2) setDropdownOpen(true);
              }}
              placeholder="Type first letters of company/contact..."
              className="w-full rounded-l-md px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void openClientDropdown()}
              aria-label="Show clients"
              title="Show clients"
              className="rounded-r-md border-l border-slate-300 px-3 text-slate-600 hover:bg-slate-50"
            >
              ▼
            </button>
          </div>
          {suggestionsLoading ? (
            <p className="mt-1 text-xs text-slate-500">Searching...</p>
          ) : null}
          {dropdownOpen && suggestions.length > 0 ? (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => chooseClient(c)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{c.company_name}</span>
                    {c.contact_name ? (
                      <span className="ml-2 text-slate-500">· {c.contact_name}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">
            {selectedClientId ? "Matched to existing client." : "No client selected."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer name</label>
            <input
              name="customer_name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer phone</label>
            <input
              name="customer_phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Customer email</label>
            <input
              name="customer_email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Address line 1</label>
            <input
              name="address1"
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Address line 2</label>
            <input
              name="address2"
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Town</label>
            <input
              name="town"
              value={town}
              onChange={(e) => setTown(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Postcode</label>
            <input
              name="postcode"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Title</label>
          <input
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Description</label>
          <textarea
            name="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {officeSalesPitch.trim() ? (
          <section className="rounded-lg border border-indigo-200 bg-indigo-50/90 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-indigo-950">
              Office — how to present this quote
            </h3>
            <p className="mt-1 text-xs text-indigo-900/85">
              From AI using your Quotes pricing guide and the customer message. Tune
              the wording before you rely on it; not contractual.
            </p>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {officeSalesPitch}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Initial price</label>
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {price.trim() !== "" && Number.isFinite(Number(price)) ? (
              <p className="mt-1 text-xs text-slate-500">
                Display: {formatCurrency(Number(price), currencyCode)}
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Quote date</label>
            <input
              name="quote_date"
              type="date"
              value={quoteDate}
              onChange={(e) => {
                const q = e.target.value;
                setQuoteDate(q);
                if (q) setExpiresAt(addDaysToLocalIsoDate(q, QUOTES_VALID_DAYS));
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Defaults to today when you open this page or run AI parse.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Expires at</label>
            <input
              name="expires_at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Defaults to {QUOTES_VALID_DAYS} days after the quote date; you can edit.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Create quote"}
        </button>
      </form>
    </div>
  );
}
