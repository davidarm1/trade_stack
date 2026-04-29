"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, searchClients } from "@/actions/clients";
import { createJob } from "@/actions/jobs";
import type { Client } from "@/types/database";
import type { JobAiPrefill } from "@/types/job-ai-prefill";

type UserOpt = { id: string; name: string | null };

function siteSnapshotFromClient(c: Client) {
  return {
    site_address1: c.site_address1 ?? c.address1 ?? "",
    site_address2: c.site_address2 ?? c.address2 ?? "",
    site_town: c.site_town ?? c.town ?? "",
    site_postcode: c.site_postcode ?? c.postcode ?? "",
    payment_terms_days:
      c.payment_terms_days != null ? String(c.payment_terms_days) : "",
  };
}

function matchEngineerId(
  engineers: UserOpt[],
  name: string | null | undefined,
): string {
  if (!name?.trim()) return "";
  const q = name.trim().toLowerCase();
  const exact = engineers.find(
    (u) => (u.name ?? "").trim().toLowerCase() === q,
  );
  if (exact) return exact.id;
  const partial = engineers.find((u) =>
    (u.name ?? "").toLowerCase().includes(q),
  );
  if (partial) return partial.id;
  const byFirst = engineers.find((u) => {
    const parts = (u.name ?? "").trim().toLowerCase().split(/\s+/u);
    return parts[0] === q;
  });
  return byFirst?.id ?? "";
}

export function NewJobForm({
  engineers,
  prefill = null,
}: {
  engineers: UserOpt[];
  prefill?: JobAiPrefill | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const hintNew = Boolean(prefill?.new_company_name?.trim());
  const assignedEngineerDefault = matchEngineerId(
    engineers,
    prefill?.assigned_engineer_name,
  );

  const [clientQuery, setClientQuery] = useState(
    () => prefill?.new_company_name?.trim() ?? "",
  );
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Client[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isNewClient, setIsNewClient] = useState(() => hintNew);

  const [siteAddress1, setSiteAddress1] = useState(
    () => prefill?.site_address1 ?? "",
  );
  const [siteAddress2, setSiteAddress2] = useState(
    () => prefill?.site_address2 ?? "",
  );
  const [siteTown, setSiteTown] = useState(() => prefill?.site_town ?? "");
  const [sitePostcode, setSitePostcode] = useState(
    () => prefill?.site_postcode ?? "",
  );
  const [paymentTermsDays, setPaymentTermsDays] = useState(() =>
    prefill?.payment_terms_days != null
      ? String(prefill.payment_terms_days)
      : "",
  );

  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(clientQuery), 300);
    return () => clearTimeout(t);
  }, [clientQuery]);

  useEffect(() => {
    if (isNewClient || debouncedQuery.length < 2) {
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
  }, [debouncedQuery, isNewClient]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const selectExistingClient = useCallback((c: Client) => {
    setSelectedClientId(c.id);
    setIsNewClient(false);
    setClientQuery(c.company_name);
    const snap = siteSnapshotFromClient(c);
    setSiteAddress1(snap.site_address1);
    setSiteAddress2(snap.site_address2);
    setSiteTown(snap.site_town);
    setSitePostcode(snap.site_postcode);
    setPaymentTermsDays(snap.payment_terms_days);
    setDropdownOpen(false);
    setSuggestions([]);
  }, []);

  const startNewClient = useCallback(() => {
    setSelectedClientId(null);
    setIsNewClient(true);
    setDropdownOpen(false);
    setSuggestions([]);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") || "");
    const description = String(form.get("description") || "");
    const job_type = String(form.get("job_type") || "") || null;
    const assigned = String(form.get("assigned_engineer_id") || "");
    const date_onsite = String(form.get("date_onsite") || "") || null;
    const labour = form.get("labour_charge");
    const labour_charge =
      labour != null && String(labour) !== "" ? Number(labour) : null;

    let site1 = siteAddress1.trim() || null;
    let site2 = siteAddress2.trim() || null;
    let town = siteTown.trim() || null;
    let postcode = sitePostcode.trim() || null;
    let pt =
      paymentTermsDays.trim() !== ""
        ? Number(paymentTermsDays)
        : null;

    let clientId = selectedClientId;

    if (isNewClient) {
      const company_name = String(form.get("new_company_name") || "").trim();
      if (!company_name) {
        setPending(false);
        setError("Enter a company name for the new client.");
        return;
      }

      const { data: newRow, error: createErr } = await createClient({
        company_name,
        address1: String(form.get("new_address1") ?? "").trim() || null,
        address2: String(form.get("new_address2") ?? "").trim() || null,
        town: String(form.get("new_town") ?? "").trim() || null,
        postcode: String(form.get("new_postcode") ?? "").trim() || null,
        contact_name: String(form.get("new_contact_name") ?? "").trim() || null,
        contact_email: String(form.get("new_contact_email") ?? "").trim() || null,
        contact_number: String(form.get("new_contact_number") ?? "").trim() || null,
        site_address1: String(form.get("new_site_address1") ?? "").trim() || null,
        site_address2: String(form.get("new_site_address2") ?? "").trim() || null,
        site_town: String(form.get("new_site_town") ?? "").trim() || null,
        site_postcode: String(form.get("new_site_postcode") ?? "").trim() || null,
        payment_terms_days: form.get("new_payment_terms_days")
          ? Number(form.get("new_payment_terms_days"))
          : null,
        default_vat_exempt: form.get("new_default_vat_exempt") === "on",
        notes: String(form.get("new_notes") ?? "").trim() || null,
        is_active: true,
      });

      if (createErr || !newRow) {
        setPending(false);
        setError(createErr ?? "Could not create client");
        return;
      }
      clientId = newRow.id;
      if (!site1) site1 = newRow.site_address1 ?? newRow.address1 ?? null;
      if (!site2) site2 = newRow.site_address2 ?? newRow.address2 ?? null;
      if (!town) town = newRow.site_town ?? newRow.town ?? null;
      if (!postcode) postcode = newRow.site_postcode ?? newRow.postcode ?? null;
      if (pt == null && newRow.payment_terms_days != null) {
        pt = newRow.payment_terms_days;
      }
    }

    if (!clientId) {
      setPending(false);
      setError("Search and select a client, or add a new client.");
      return;
    }

    const po = String(form.get("custom_po_number") ?? "").trim() || null;
    const legacyRef = String(form.get("legacy_ref") ?? "").trim() || null;

    const { data, error: err } = await createJob({
      client_id: clientId,
      title,
      description,
      job_type,
      assigned_engineer_id: assigned || null,
      date_onsite,
      site_address1: site1,
      site_address2: site2,
      site_town: town,
      site_postcode: postcode,
      labour_charge,
      payment_terms_days: pt,
      status: "open",
      custom_po_number: po,
      legacy_ref: legacyRef,
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
      <div ref={wrapRef} className="relative">
        <label className="block text-sm font-medium text-slate-700">
          Client
        </label>
        <p className="mt-0.5 text-xs text-slate-500">
          Type at least 2 characters to search. Pick a match to auto-fill site
          details, or add a new client.
        </p>
        <input
          type="text"
          autoComplete="off"
          value={clientQuery}
          disabled={isNewClient}
          onChange={(e) => {
            setClientQuery(e.target.value);
            setSelectedClientId(null);
            setDropdownOpen(e.target.value.trim().length >= 2);
          }}
          onFocus={() => {
            if (!isNewClient && clientQuery.trim().length >= 2) {
              setDropdownOpen(true);
            }
          }}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          placeholder="Search company or contact…"
        />
        {suggestionsLoading && !isNewClient && (
          <p className="mt-1 text-xs text-slate-500">Searching…</p>
        )}
        {dropdownOpen && !isNewClient && suggestions.length > 0 && (
          <ul
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
            role="listbox"
          >
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-slate-50"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => selectExistingClient(c)}
                >
                  <span className="font-medium text-slate-900">
                    {c.company_name}
                  </span>
                  {c.contact_name ? (
                    <span className="ml-2 text-slate-500">
                      · {c.contact_name}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedClientId && !isNewClient && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
              Linked to saved client
            </span>
          )}
          {isNewClient ? (
            <button
              type="button"
              className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
              onClick={() => {
                setIsNewClient(false);
                setClientQuery("");
              }}
            >
              Cancel new client — search instead
            </button>
          ) : (
            <button
              type="button"
              className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
              onClick={() => {
                startNewClient();
                setClientQuery("");
              }}
            >
              Can’t find them? Add new client
            </button>
          )}
        </div>
      </div>

      {isNewClient && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">New client</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Company name
            </label>
            <input
              name="new_company_name"
              required
              defaultValue={prefill?.new_company_name?.trim() ?? clientQuery}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Address line 1
              </label>
              <input
                name="new_address1"
                defaultValue={prefill?.new_address1 ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Address line 2
              </label>
              <input
                name="new_address2"
                defaultValue={prefill?.new_address2 ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Town
              </label>
              <input
                name="new_town"
                defaultValue={prefill?.new_town ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Postcode
              </label>
              <input
                name="new_postcode"
                defaultValue={prefill?.new_postcode ?? ""}
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
                name="new_contact_name"
                defaultValue={prefill?.new_contact_name ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Contact email
              </label>
              <input
                name="new_contact_email"
                type="email"
                defaultValue={prefill?.new_contact_email ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Contact number
              </label>
              <input
                name="new_contact_number"
                defaultValue={prefill?.new_contact_number ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Payment terms (days)
              </label>
              <input
                name="new_payment_terms_days"
                type="number"
                min={0}
                defaultValue={
                  prefill?.new_payment_terms_days != null
                    ? String(prefill.new_payment_terms_days)
                    : ""
                }
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
                name="new_site_address1"
                defaultValue={prefill?.new_site_address1 ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Default site address 2
              </label>
              <input
                name="new_site_address2"
                defaultValue={prefill?.new_site_address2 ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Site town
              </label>
              <input
                name="new_site_town"
                defaultValue={prefill?.new_site_town ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Site postcode
              </label>
              <input
                name="new_site_postcode"
                defaultValue={prefill?.new_site_postcode ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="new_default_vat_exempt"
              name="new_default_vat_exempt"
              type="checkbox"
              className="rounded border-slate-300"
            />
            <label
              htmlFor="new_default_vat_exempt"
              className="text-sm text-slate-700"
            >
              Default VAT exempt
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              name="new_notes"
              rows={2}
              defaultValue={prefill?.new_notes ?? ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Title
        </label>
        <input
          name="title"
          required
          defaultValue={prefill?.title ?? ""}
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
          defaultValue={prefill?.description ?? ""}
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
          defaultValue={prefill?.job_type ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Assigned engineer
        </label>
        <select
          name="assigned_engineer_id"
          defaultValue={assignedEngineerDefault}
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
          defaultValue={prefill?.date_onsite ?? ""}
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
            value={siteAddress1}
            onChange={(e) => setSiteAddress1(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Site address line 2
          </label>
          <input
            name="site_address2"
            value={siteAddress2}
            onChange={(e) => setSiteAddress2(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Town</label>
          <input
            name="site_town"
            value={siteTown}
            onChange={(e) => setSiteTown(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Postcode
          </label>
          <input
            name="site_postcode"
            value={sitePostcode}
            onChange={(e) => setSitePostcode(e.target.value)}
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
            autoComplete="off"
            placeholder="Client purchase order"
            defaultValue={prefill?.custom_po_number ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Legacy ref
          </label>
          <input
            name="legacy_ref"
            autoComplete="off"
            placeholder="Old system job id (optional)"
            defaultValue={prefill?.legacy_ref ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Only for migrated jobs — searchable alongside the new job number
            (#…) assigned automatically.
          </p>
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
            defaultValue={
              prefill?.labour_charge != null ? String(prefill.labour_charge) : ""
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
            value={paymentTermsDays}
            onChange={(e) => setPaymentTermsDays(e.target.value)}
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
