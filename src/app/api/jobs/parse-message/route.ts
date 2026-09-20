import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { recordAiUsage } from "@/lib/ai-usage";
import { normalizeCurrencyCode } from "@/lib/format-currency";
import {
  QUOTES_AI_PRICING_PROMPT_DEFAULT,
  QUOTES_AI_PRICING_PROMPT_KEY,
} from "@/lib/quotes-ai-pricing-prompt";
import type { JobAiPrefill } from "@/types/job-ai-prefill";

export const runtime = "nodejs";

const SYSTEM = `You extract structured job data from client messages for a UK trades / field-service business — this can be informal (email, SMS, WhatsApp) or a formal purchase order / work-order document with labelled fields.
Return ONLY a JSON object (no markdown fences) with these keys. Use null for anything unknown or not stated.

- title: short job title (string, required if any work is described)
- description: the scope of work only — if the message has an explicit "Job description:" (or "Scope of work:", "Details:") line or sentence, use exactly that; otherwise a short plain-English summary of the work requested. Do NOT copy the whole message, and do NOT repeat customer/site address or pricing details that are already captured in other fields below.
- customer_type: "domestic" if this looks like a homeowner/private person, "business" if it looks like a company/commercial customer
- date_onsite: YYYY-MM-DD if a specific visit date is mentioned, else null
- time_onsite: a time or time window if one is mentioned (e.g. "2pm", "morning", "9-11am"), as plain text, else null
- site_address1, site_address2, site_town, site_postcode: work site (strings, empty if unknown)
- labour_charge: estimated labour/visit charge as one number using the tenant pricing guide; if the message states an explicit price excluding VAT for the job, use that instead; null only if there is not enough information to make a reasonable estimate
- vat_rate: VAT percentage as a plain number (e.g. 20 for 20%) only if explicitly stated in the message; else null
- payment_terms_days: 0 for domestic/private homeowner work; 30 for business/commercial work unless the message or tenant guide says otherwise
- custom_po_number, legacy_ref: strings or null — custom_po_number is an actual PO/order reference number if one is given, not just the customer's name
- new_company_name: company name if a business is identifiable; otherwise use the person's/customer's name
- new_contact_name, new_contact_email, new_contact_number: strings or null
- new_address1, new_address2, new_town, new_postcode: client billing address if given, else empty string or null
- new_site_address1, new_site_address2, new_site_town, new_site_postcode: only if site differs from billing; else null
- new_payment_terms_days: same rule as payment_terms_days: 0 for domestic/private homeowner work; 30 for business/commercial work unless stated otherwise
- new_notes: short internal notes about the client if implied, else null
- assigned_engineer_name: first name or full name of engineer if the message assigns someone, else null

If only a site address is given but it is clearly also the client premises, copy into new_* billing fields where appropriate.
Prefer UK date formats when inferring date_onsite.
The user message includes "--- Tenant pricing / business rules ---" with this tenant's guide. Use it to estimate labour_charge for the job.`;

function stripJsonFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/u, "");
  }
  return t.trim();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function intOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n == null) return null;
  return Math.round(n);
}

function customerType(v: unknown): "business" | "domestic" {
  return typeof v === "string" && v.trim().toLowerCase() === "business"
    ? "business"
    : "domestic";
}

function extractPhone(text: string): string | undefined {
  const match = text.match(/(?:\+44\s?|0)(?:\d[\s-]?){9,10}\d/u);
  return match?.[0]?.replace(/\s+/g, " ").trim();
}

function extractPostcode(text: string): string | undefined {
  const match = text.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/iu);
  return match?.[0]?.toUpperCase().replace(/\s+/u, " ").trim();
}

function extractCustomerName(text: string): string | undefined {
  const patterns = [
    /\bmy name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/u,
    /\bthis is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/u,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const name = match?.[1]?.trim();
    if (name) return name;
  }
  return undefined;
}

function extractAddressParts(text: string): {
  address1?: string;
  town?: string;
  postcode?: string;
} {
  const postcode = extractPostcode(text);
  const addressMatch = text.match(
    /\b(?:address is|at|address:)\s+([^.\n]+?)(?:\.|$)/iu,
  );
  const rawAddress = addressMatch?.[1]?.trim();
  const parts = rawAddress
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const address1 = parts?.[0];
  const town =
    parts && parts.length > 1
      ? parts[1]
      : text.match(/\bbased in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/u)?.[1];

  return { address1, town, postcode };
}

/**
 * Lines following a "Label:\n..." block, up to the first blank line or the
 * next "Something:" style label line (so "Telephone: ..." / "Email: ..."
 * right after an address don't get swept in as address lines).
 */
function extractLabelledBlockLines(text: string, label: string): string[] {
  const re = new RegExp(
    `\\b${label}\\s*:[ \\t]*\\n([\\s\\S]*?)(?=\\n[ \\t]*\\n|\\n[A-Za-z][A-Za-z ]{1,30}:|$)`,
    "iu",
  );
  const match = text.match(re);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Distributes 1+ free-text address lines across address1/address2/town. */
function splitAddressLines(lines: string[]): {
  address1?: string;
  address2?: string;
  town?: string;
} {
  if (lines.length === 0) return {};
  if (lines.length === 1) return { address1: lines[0] };
  if (lines.length === 2) return { address1: lines[0], town: lines[1] };
  return {
    address1: lines[0],
    address2: lines.slice(1, -1).join(", "),
    town: lines[lines.length - 1],
  };
}

/**
 * A full address block under a label, e.g.
 * "Site:\nSGN Axis Edinburgh\nAxis House\n5 Lonehead Drive\nNewbridge\nEdinburgh\nEH28 8TG"
 * — first line is the name (company/site name), the postcode is found
 * within the block specifically (not the first one anywhere in the whole
 * message), and everything else in between is split across address lines
 * and town. Distinct labelled blocks (e.g. "Customer" vs "Site") are kept
 * fully independent so one address never leaks into another's fields.
 */
function extractLabelledAddress(
  text: string,
  labels: string[],
): { name?: string; address1?: string; address2?: string; town?: string; postcode?: string } {
  for (const label of labels) {
    const lines = extractLabelledBlockLines(text, label);
    if (lines.length === 0) continue;
    const [name, ...rest] = lines;
    const postcode = extractPostcode(rest.join("\n"));
    const addressLines = postcode
      ? rest.filter((l) => !l.toUpperCase().includes(postcode))
      : rest;
    const { address1, address2, town } = splitAddressLines(addressLines);
    if (address1 || postcode) return { name, address1, address2, town, postcode };
  }
  return {};
}

/**
 * Grabs the value after a "Label:" — either on the same line
 * ("Job type: Drain clearance") or, if nothing follows the colon, the next
 * non-blank line ("Customer:\nAtlas Maintenance (Scotland) Ltd").
 */
function extractLabelledLine(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const sameLine = text.match(new RegExp(`\\b${label}\\s*:[ \\t]*([^\\n]+)`, "iu"));
    const inline = sameLine?.[1]?.trim();
    if (inline) return inline;

    const nextLine = text.match(new RegExp(`\\b${label}\\s*:[ \\t]*\\n\\s*([^\\n]+)`, "iu"));
    const next = nextLine?.[1]?.trim();
    if (next) return next;
  }
  return undefined;
}

function extractVatRatePercent(text: string): number | undefined {
  const match = text.match(/\bVAT\s*rate\s*:?\s*(\d+(?:\.\d+)?)\s*%/iu);
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function extractPriceExVat(text: string): number | undefined {
  const match = text.match(
    /\bPrice\s*(?:excluding|ex\.?)\s*VAT\s*:?\s*£?\s*(\d+(?:[.,]\d+)?)/iu,
  );
  const raw = match?.[1]?.replace(",", "");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function applyFallbacks(prefill: JobAiPrefill, sourceText: string): JobAiPrefill {
  const contactName = prefill.new_contact_name ?? extractCustomerName(sourceText);
  const phone = prefill.new_contact_number ?? extractPhone(sourceText);
  // Billing (customer) and job-site addresses are extracted from their own
  // labelled blocks independently — a message can (and here does) contain
  // several distinct addresses (customer, site, and HydroScot's own), and
  // conflating them into one generic "first address/postcode found
  // anywhere" was stamping the customer's postcode onto the site fields.
  const customerAddr = extractLabelledAddress(sourceText, [
    "Customer",
    "Client",
    "Bill to",
    "Account name",
  ]);
  const siteAddrRaw = extractLabelledAddress(sourceText, [
    "Site",
    "Site address",
    "Work site",
    "Job site",
  ]);
  // Unlike the customer block, a site has no separate "name" field to hold
  // its first line (e.g. a building/location name like "SGN Axis
  // Edinburgh") — fold it into address1 rather than silently dropping it.
  const siteAddr = {
    ...siteAddrRaw,
    address1: [siteAddrRaw.name, siteAddrRaw.address1].filter(Boolean).join(", ") || undefined,
  };
  // Last-resort generic scan for informal messages with no labelled blocks.
  const generic = extractAddressParts(sourceText);

  // If the model didn't return a description, try to pull the explicit
  // labelled line from the message before falling back to dumping the
  // entire raw message in — a formal PO-style message already has this
  // info duplicated across the structured fields below, so repeating all
  // of it in description too is redundant and confusing on the job sheet.
  const description =
    prefill.description?.trim() ||
    extractLabelledLine(sourceText, ["Job description", "Scope of work", "Details"]) ||
    sourceText;
  const vatRate = prefill.vat_rate ?? extractVatRatePercent(sourceText) ?? undefined;
  const labourCharge = prefill.labour_charge ?? extractPriceExVat(sourceText) ?? undefined;

  return {
    ...prefill,
    description,
    labour_charge: labourCharge ?? null,
    vat_rate: vatRate ?? null,
    new_company_name: prefill.new_company_name ?? customerAddr.name ?? contactName,
    new_contact_name: contactName,
    new_contact_number: phone,
    new_address1: prefill.new_address1 ?? customerAddr.address1 ?? generic.address1,
    new_address2: prefill.new_address2 ?? customerAddr.address2,
    new_town: prefill.new_town ?? customerAddr.town ?? generic.town,
    new_postcode: prefill.new_postcode ?? customerAddr.postcode ?? generic.postcode,
    // Job site: use a distinct "Site:" block if the message has one, else
    // assume the work happens at the customer's own address — but never mix
    // lines/postcode across the two.
    site_address1:
      prefill.site_address1 ?? siteAddr.address1 ?? customerAddr.address1 ?? generic.address1,
    site_address2: prefill.site_address2 ?? siteAddr.address2 ?? customerAddr.address2,
    site_town: prefill.site_town ?? siteAddr.town ?? customerAddr.town ?? generic.town,
    site_postcode:
      prefill.site_postcode ?? siteAddr.postcode ?? customerAddr.postcode ?? generic.postcode,
    // Only set new_site_* (meaning "site differs from billing") when an
    // actual separate Site: block was found in the message.
    new_site_address1: prefill.new_site_address1 ?? siteAddr.address1,
    new_site_address2: prefill.new_site_address2 ?? siteAddr.address2,
    new_site_town: prefill.new_site_town ?? siteAddr.town,
    new_site_postcode: prefill.new_site_postcode ?? siteAddr.postcode,
    payment_terms_days: prefill.payment_terms_days ?? 0,
    new_payment_terms_days: prefill.new_payment_terms_days ?? 0,
  };
}

function toPrefill(obj: Record<string, unknown>): JobAiPrefill {
  const site1 = str(obj.site_address1);
  const site2 = str(obj.site_address2);
  const siteTown = str(obj.site_town);
  const sitePc = str(obj.site_postcode);
  const inferredCustomerType = customerType(obj.customer_type);
  const defaultPaymentTerms = inferredCustomerType === "business" ? 30 : 0;
  const paymentTerms =
    intOrNull(obj.payment_terms_days) ?? defaultPaymentTerms;
  const newPaymentTerms =
    intOrNull(obj.new_payment_terms_days) ?? paymentTerms;

  const prefill: JobAiPrefill = {
    title: str(obj.title).trim() || undefined,
    description: str(obj.description).trim() || undefined,
    date_onsite: strOrNull(obj.date_onsite),
    time_onsite: strOrNull(obj.time_onsite),
    site_address1: site1.trim() || undefined,
    site_address2: site2.trim() || undefined,
    site_town: siteTown.trim() || undefined,
    site_postcode: sitePc.trim() || undefined,
    labour_charge: numOrNull(obj.labour_charge),
    vat_rate: numOrNull(obj.vat_rate),
    payment_terms_days: paymentTerms,
    custom_po_number: strOrNull(obj.custom_po_number) ?? undefined,
    legacy_ref: strOrNull(obj.legacy_ref) ?? undefined,
    new_company_name: str(obj.new_company_name).trim() || undefined,
    new_contact_name: str(obj.new_contact_name).trim() || undefined,
    new_contact_email: str(obj.new_contact_email).trim() || undefined,
    new_contact_number: str(obj.new_contact_number).trim() || undefined,
    new_address1: str(obj.new_address1).trim() || undefined,
    new_address2: str(obj.new_address2).trim() || undefined,
    new_town: str(obj.new_town).trim() || undefined,
    new_postcode: str(obj.new_postcode).trim() || undefined,
    new_site_address1: str(obj.new_site_address1).trim() || undefined,
    new_site_address2: str(obj.new_site_address2).trim() || undefined,
    new_site_town: str(obj.new_site_town).trim() || undefined,
    new_site_postcode: str(obj.new_site_postcode).trim() || undefined,
    new_payment_terms_days: newPaymentTerms,
    new_notes: str(obj.new_notes).trim() || undefined,
    assigned_engineer_name: strOrNull(obj.assigned_engineer_name),
  };

  if (!prefill.new_company_name && prefill.new_contact_name) {
    prefill.new_company_name = prefill.new_contact_name;
  }

  if (!prefill.new_site_address1 && !prefill.new_site_town && !prefill.new_site_postcode) {
    if (prefill.new_company_name || prefill.new_address1) {
      if (!prefill.new_site_address1 && site1) prefill.new_site_address1 = site1;
      if (!prefill.new_site_address2 && site2) prefill.new_site_address2 = site2;
      if (!prefill.new_site_town && siteTown) prefill.new_site_town = siteTown;
      if (!prefill.new_site_postcode && sitePc) prefill.new_site_postcode = sitePc;
    }
  }

  return prefill;
}

export async function POST(request: Request) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;

  const { supabase, tenantId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text =
    typeof body === "object" &&
    body !== null &&
    "text" in body &&
    typeof (body as { text: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";

  if (text.length < 8) {
    return NextResponse.json(
      { error: "Paste a longer message (at least a few words)." },
      { status: 400 },
    );
  }
  if (text.length > 48_000) {
    return NextResponse.json(
      { error: "Message is too long. Trim and try again." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const openai = new OpenAI({ apiKey });
  const model = "gpt-4o-mini";
  const [{ data: settingRow }, { data: tenantRow }] = await Promise.all([
    supabase
      .from("settings")
      .select("field_value")
      .eq("tenant_id", tenantId)
      .eq("field_key", QUOTES_AI_PRICING_PROMPT_KEY)
      .maybeSingle(),
    supabase.from("tenants").select("currency").eq("id", tenantId).maybeSingle(),
  ]);
  const masterPrompt =
    settingRow?.field_value?.trim() || QUOTES_AI_PRICING_PROMPT_DEFAULT;
  const tenantCurrency = normalizeCurrencyCode(tenantRow?.currency);

  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null =
    null;
  let prefill: JobAiPrefill | null = null;
  let parseError: string | null = null;

  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `--- Tenant pricing / business rules ---\n${masterPrompt}\n\n--- Customer message ---\n${text}\n\n--- Context ---\nDisplay currency (ISO 4217): ${tenantCurrency}. Estimate labour_charge as one number in this currency.`,
        },
      ],
    });

    usage = completion.usage ?? null;

    const raw = completion.choices[0]?.message?.content ?? "";
    const obj = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
    prefill = applyFallbacks(toPrefill(obj), text);
    if (!prefill.title?.trim()) {
      prefill = null;
      parseError = "Could not infer a job title from the message.";
    }
  } catch (e) {
    parseError =
      e instanceof Error ? e.message : "AI parsing failed. Try again or enter manually.";
  }

  const metered = await recordAiUsage({
    supabase,
    tenantId,
    feature: "job_message_parse",
    model,
    usage,
    logLabel: "[parse-message]",
  });
  if (!metered.ok) {
    return NextResponse.json({ error: metered.error }, { status: 500 });
  }

  if (parseError || !prefill) {
    return NextResponse.json(
      { error: parseError ?? "Could not parse the message." },
      { status: 422 },
    );
  }

  return NextResponse.json({ prefill });
}
