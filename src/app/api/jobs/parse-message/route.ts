import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { normalizeCurrencyCode } from "@/lib/format-currency";
import {
  QUOTES_AI_PRICING_PROMPT_DEFAULT,
  QUOTES_AI_PRICING_PROMPT_KEY,
} from "@/lib/quotes-ai-pricing-prompt";
import type { JobAiPrefill } from "@/types/job-ai-prefill";

export const runtime = "nodejs";

const SYSTEM = `You extract structured job data from informal client messages (email, SMS, WhatsApp) for a UK trades / field-service business.
Return ONLY a JSON object (no markdown fences) with these keys. Use null for anything unknown or not stated.

- title: short job title (string, required if any work is described)
- description: fuller scope / notes (string, may be empty)
- customer_type: "domestic" if this looks like a homeowner/private person, "business" if it looks like a company/commercial customer
- date_onsite: YYYY-MM-DD if a specific visit date is mentioned, else null
- site_address1, site_address2, site_town, site_postcode: work site (strings, empty if unknown)
- labour_charge: estimated labour/visit charge as one number using the tenant pricing guide; null only if there is not enough information to make a reasonable estimate
- payment_terms_days: 0 for domestic/private homeowner work; 30 for business/commercial work unless the message or tenant guide says otherwise
- custom_po_number, legacy_ref: strings or null
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

function applyFallbacks(prefill: JobAiPrefill, sourceText: string): JobAiPrefill {
  const contactName = prefill.new_contact_name ?? extractCustomerName(sourceText);
  const phone = prefill.new_contact_number ?? extractPhone(sourceText);
  const address = extractAddressParts(sourceText);
  const description = prefill.description?.trim() || sourceText;

  return {
    ...prefill,
    description,
    new_company_name: prefill.new_company_name ?? contactName,
    new_contact_name: contactName,
    new_contact_number: phone,
    site_address1: prefill.site_address1 ?? address.address1,
    site_town: prefill.site_town ?? address.town,
    site_postcode: prefill.site_postcode ?? address.postcode,
    new_address1: prefill.new_address1 ?? address.address1,
    new_town: prefill.new_town ?? address.town,
    new_postcode: prefill.new_postcode ?? address.postcode,
    new_site_address1: prefill.new_site_address1 ?? address.address1,
    new_site_town: prefill.new_site_town ?? address.town,
    new_site_postcode: prefill.new_site_postcode ?? address.postcode,
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
    site_address1: site1.trim() || undefined,
    site_address2: site2.trim() || undefined,
    site_town: siteTown.trim() || undefined,
    site_postcode: sitePc.trim() || undefined,
    labour_charge: numOrNull(obj.labour_charge),
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

  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
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

    const usage = completion.usage;
    promptTokens = usage?.prompt_tokens ?? null;
    completionTokens = usage?.completion_tokens ?? null;
    totalTokens = usage?.total_tokens ?? null;

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

  const { error: usageErr } = await supabase.from("ai_usage").insert({
    tenant_id: tenantId,
    feature: "job_message_parse",
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    cost_usd: null,
  });

  if (usageErr) {
    return NextResponse.json({ error: usageErr.message }, { status: 500 });
  }

  if (parseError || !prefill) {
    return NextResponse.json(
      { error: parseError ?? "Could not parse the message." },
      { status: 422 },
    );
  }

  return NextResponse.json({ prefill });
}
