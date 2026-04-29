"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  convertQuoteToJob,
  softDeleteQuote,
  updateQuote,
} from "@/actions/quotes";
import { getClients, searchClients } from "@/actions/clients";
import { formatCurrency } from "@/lib/format-currency";
import {
  QUOTES_VALID_DAYS,
  addDaysToLocalIsoDate,
  isoDateInputFromDb,
} from "@/lib/quote-form-dates";
import type { Client, Quote } from "@/types/database";

const STATUS_OPTIONS = [
  "pending",
  "draft",
  "quoted",
  "sent",
  "accepted",
  "declined",
  "booked",
] as const;

export function EditQuoteForm({
  quote,
  currencyCode,
}: {
  quote: Quote;
  currencyCode: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const booked = quote.status === "booked";

  const [customerName, setCustomerName] = useState(quote.customer_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(quote.customer_email ?? "");
  const [customerPhone, setCustomerPhone] = useState(quote.customer_phone ?? "");
  const [address1, setAddress1] = useState(quote.address1 ?? "");
  const [address2, setAddress2] = useState(quote.address2 ?? "");
  const [town, setTown] = useState(quote.town ?? "");
  const [postcode, setPostcode] = useState(quote.postcode ?? "");
  const [title, setTitle] = useState(quote.title ?? "");
  const [description, setDescription] = useState(quote.description ?? "");
  const [price, setPrice] = useState(
    quote.price != null ? String(quote.price) : "",
  );
  const [quoteDate, setQuoteDate] = useState(isoDateInputFromDb(quote.quote_date));
  const [expiresAt, setExpiresAt] = useState(isoDateInputFromDb(quote.expires_at));
  const [status, setStatus] = useState(quote.status ?? "pending");

  const [clientQuery, setClientQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allClientsLoaded, setAllClientsLoaded] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    quote.client_id,
  );
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
    const statusValue = booked
      ? String(quote.status ?? "").trim()
      : String(form.get("status") ?? "").trim();

    const { error: saveErr } = await updateQuote(quote.id, {
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
      status: statusValue || null,
    });

    setPending(false);
    if (saveErr) {
      setError(saveErr);
      return;
    }
    router.refresh();
  }

  async function onCreateJob() {
    setError(null);
    if (!confirm("Create an open job from this quote?")) return;
    const r = await convertQuoteToJob(quote.id);
    if (r.error) {
      setError(r.error);
      return;
    }
    if (r.data?.id) {
      router.push(`/jobs/${r.data.id}`);
      router.refresh();
    }
  }

  async function onArchive() {
    setError(null);
    if (
      !confirm(
        "Archive this quote? It will disappear from the list (soft delete).",
      )
    )
      return;
    const r = await softDeleteQuote(quote.id);
    if (r.error) {
      setError(r.error);
      return;
    }
    router.push("/quotes");
    router.refresh();
  }

  return (
    <div className="mt-6 max-w-3xl space-y-4">
      {booked ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This quote is marked booked
          {quote.booked_job_id ? (
            <>
              {" "}
              —{" "}
              <Link
                href={`/jobs/${quote.booked_job_id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                open linked job
              </Link>
            </>
          ) : null}
          .
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div ref={wrapRef} className="relative">
          <label className="block text-sm font-medium text-slate-700">
            Match existing client (optional)
          </label>
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

        <div>
          <label className="block text-sm font-medium text-slate-700">Status</label>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={booked}
            className="mt-1 w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          >
            {Array.from(
              new Set([...STATUS_OPTIONS, quote.status].filter(Boolean) as string[]),
            ).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {booked ? (
            <p className="mt-1 text-xs text-slate-500">
              Status stays booked while linked to a job.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Price</label>
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
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          {!booked ? (
            <button
              type="button"
              onClick={() => void onCreateJob()}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Create job (customer approved)
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void onArchive()}
            className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50"
          >
            Archive quote
          </button>
        </div>
      </form>
    </div>
  );
}
