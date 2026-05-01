import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionTenantOrError } from "@/lib/api-auth";
import type { JobAiPrefill } from "@/types/job-ai-prefill";

export const runtime = "nodejs";

const SYSTEM = `You extract structured job data from informal client messages (email, SMS, WhatsApp) for a UK trades / field-service business.
Return ONLY a JSON object (no markdown fences) with these keys. Use null for anything unknown or not stated.

- title: short job title (string, required if any work is described)
- description: fuller scope / notes (string, may be empty)
- date_onsite: YYYY-MM-DD if a specific visit date is mentioned, else null
- site_address1, site_address2, site_town, site_postcode: work site (strings, empty if unknown)
- labour_charge: number in GBP if a labour/day rate is clearly stated, else null
- payment_terms_days: integer days if payment terms mentioned (e.g. 30 day invoice), else null
- custom_po_number, legacy_ref: strings or null
- new_company_name: billing/client company name if identifiable, else null
- new_contact_name, new_contact_email, new_contact_number: strings or null
- new_address1, new_address2, new_town, new_postcode: client billing address if given, else empty string or null
- new_site_address1, new_site_address2, new_site_town, new_site_postcode: only if site differs from billing; else null
- new_payment_terms_days: integer or null (client default terms if distinct from job payment_terms_days)
- new_notes: short internal notes about the client if implied, else null
- assigned_engineer_name: first name or full name of engineer if the message assigns someone, else null

If only a site address is given but it is clearly also the client premises, copy into new_* billing fields where appropriate.
Prefer UK date formats when inferring date_onsite.`;

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

function toPrefill(obj: Record<string, unknown>): JobAiPrefill {
  const site1 = str(obj.site_address1);
  const site2 = str(obj.site_address2);
  const siteTown = str(obj.site_town);
  const sitePc = str(obj.site_postcode);

  const prefill: JobAiPrefill = {
    title: str(obj.title).trim() || undefined,
    description: str(obj.description).trim() || undefined,
    date_onsite: strOrNull(obj.date_onsite),
    site_address1: site1.trim() || undefined,
    site_address2: site2.trim() || undefined,
    site_town: siteTown.trim() || undefined,
    site_postcode: sitePc.trim() || undefined,
    labour_charge: numOrNull(obj.labour_charge),
    payment_terms_days: intOrNull(obj.payment_terms_days),
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
    new_payment_terms_days: intOrNull(obj.new_payment_terms_days),
    new_notes: str(obj.new_notes).trim() || undefined,
    assigned_engineer_name: strOrNull(obj.assigned_engineer_name),
  };

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
          content: `Extract job fields from this client message:\n\n${text}`,
        },
      ],
    });

    const usage = completion.usage;
    promptTokens = usage?.prompt_tokens ?? null;
    completionTokens = usage?.completion_tokens ?? null;
    totalTokens = usage?.total_tokens ?? null;

    const raw = completion.choices[0]?.message?.content ?? "";
    const obj = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
    prefill = toPrefill(obj);
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
