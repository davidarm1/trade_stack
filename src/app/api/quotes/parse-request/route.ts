import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { normalizeCurrencyCode } from "@/lib/format-currency";
import {
  QUOTES_AI_PRICING_PROMPT_DEFAULT,
  QUOTES_AI_PRICING_PROMPT_KEY,
} from "@/lib/quotes-ai-pricing-prompt";

export const runtime = "nodejs";

const STRUCTURE_SYSTEM = `You parse trade quote requests into fields for a quote form.

Return ONLY a JSON object with exactly these keys (no others at the top level):
- title (string)
- description (string)
- customer_name (string or null)
- customer_email (string or null)
- customer_phone (string or null)
- address1 (string or null)
- address2 (string or null)
- town (string or null)
- postcode (string or null)
- quote_date (YYYY-MM-DD or null)
- expires_at (YYYY-MM-DD or null)
- price_hint (number or null)
- office_sales_pitch (string)

The user message includes "--- Tenant pricing / business rules ---" with this tenant's guide (rates, VAT, surcharges, assumptions). Use it to estimate price_hint as ONE total in the tenant's display currency for the job (initial quote figure). If the guide implies line items, merge them into that single number unless the guide gives one explicit total.

office_sales_pitch: plain text for office staff to use on the phone or in a reply—break down what the figure covers (e.g. visit, labour scope, typical kit, reassurance on warranty/call-back if appropriate). Sound professional, warm, and fair—persuasive without hype or false promises. If price_hint is null, still offer helpful talking points from the enquiry. Use short paragraphs or lines; no markdown headings, no JSON inside this string.

If you cannot estimate price from the request and the guide, set price_hint to null.

Use null for unknown string fields except office_sales_pitch (always a non-empty string when you have any guidance; use a brief honest line if nothing else applies).

Put factual job detail in description.

If the tenant guide describes a different JSON shape, ignore that—you must still return only the keys above.`;

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Accept price_hint, or totals if the model followed a custom guide. */
function priceHintFromParsed(parsed: Record<string, unknown>): number | null {
  return (
    numOrNull(parsed.price_hint) ??
    numOrNull(parsed.total) ??
    numOrNull(parsed.subtotal)
  );
}

export async function POST(request: Request) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;

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
      { error: "Paste a longer quote request." },
      { status: 400 },
    );
  }

  const [{ data: settingRow }, { data: tenantRow }] = await Promise.all([
    session.supabase
      .from("settings")
      .select("field_value")
      .eq("tenant_id", session.tenantId)
      .eq("field_key", QUOTES_AI_PRICING_PROMPT_KEY)
      .maybeSingle(),
    session.supabase
      .from("tenants")
      .select("currency")
      .eq("id", session.tenantId)
      .maybeSingle(),
  ]);

  const masterPrompt =
    settingRow?.field_value?.trim() || QUOTES_AI_PRICING_PROMPT_DEFAULT;
  const tenantCurrency = normalizeCurrencyCode(tenantRow?.currency);

  const userContent = `--- Tenant pricing / business rules ---\n${masterPrompt}\n\n--- Customer message ---\n${text}\n\n--- Context ---\nDisplay currency (ISO 4217): ${tenantCurrency}. Mention amounts in office_sales_pitch using this currency (correct symbol for customers).`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const openai = new OpenAI({ apiKey });
  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: STRUCTURE_SYSTEM },
        { role: "user", content: userContent },
      ],
    });
  } catch {
    return NextResponse.json(
      { error: "AI request failed" },
      { status: 502 },
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<
      string,
      unknown
    >;
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON" },
      { status: 502 },
    );
  }

  const prefill = {
    title: strOrNull(parsed.title) ?? "",
    description: strOrNull(parsed.description) ?? "",
    customer_name: strOrNull(parsed.customer_name),
    customer_email: strOrNull(parsed.customer_email),
    customer_phone: strOrNull(parsed.customer_phone),
    address1: strOrNull(parsed.address1),
    address2: strOrNull(parsed.address2),
    town: strOrNull(parsed.town),
    postcode: strOrNull(parsed.postcode),
    quote_date: strOrNull(parsed.quote_date),
    expires_at: strOrNull(parsed.expires_at),
    price_hint: priceHintFromParsed(parsed),
    office_sales_pitch: strOrNull(parsed.office_sales_pitch),
  };

  const usage = completion.usage;
  await session.supabase.from("ai_usage").insert({
    tenant_id: session.tenantId,
    feature: "quote_request_parse",
    model: "gpt-4o-mini",
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    total_tokens: usage?.total_tokens ?? null,
    cost_usd: null,
  });

  return NextResponse.json({ prefill });
}
