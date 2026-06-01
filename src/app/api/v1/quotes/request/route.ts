import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { normalizeCurrencyCode } from "@/lib/format-currency";
import {
  QUOTES_AI_PRICING_PROMPT_DEFAULT,
  QUOTES_AI_PRICING_PROMPT_KEY,
} from "@/lib/quotes-ai-pricing-prompt";

export const runtime = "nodejs";

// Mirror of the parse-request system prompt — kept in sync intentionally.
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

function priceHintFromParsed(parsed: Record<string, unknown>): number | null {
  return numOrNull(parsed.price_hint) ?? numOrNull(parsed.total) ?? numOrNull(parsed.subtotal);
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
      { error: "Please provide more detail about the job." },
      { status: 400 },
    );
  }

  // Attempt AI parse using the tenant's pricing prompt
  let parsed: Record<string, unknown> | null = null;
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
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

      const userContent = `--- Tenant pricing / business rules ---\n${masterPrompt}\n\n--- Engineer job request ---\n${text}\n\n--- Context ---\nDisplay currency (ISO 4217): ${tenantCurrency}. Mention amounts in office_sales_pitch using this currency.`;

      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: STRUCTURE_SYSTEM },
          { role: "user", content: userContent },
        ],
      });

      parsed = JSON.parse(
        completion.choices[0]?.message?.content ?? "{}",
      ) as Record<string, unknown>;

      const usage = completion.usage;
      void session.supabase.from("ai_usage").insert({
        tenant_id: session.tenantId,
        feature: "mobile_quote_request",
        model: "gpt-4o-mini",
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        cost_usd: null,
      });
    } catch {
      // AI parse failed — fall through and save raw text
    }
  }

  // Build insert from parsed fields (or fall back to raw text)
  const firstLine = text.split("\n")[0]?.trim() ?? text;
  const title = parsed ? (strOrNull(parsed.title) ?? firstLine.slice(0, 120)) : firstLine.slice(0, 120);

  const aiDescription = parsed ? strOrNull(parsed.description) : null;
  const description = aiDescription
    ? `${aiDescription}\n\n---\nOriginal request:\n${text}`
    : text;

  const { data: quote, error } = await session.supabase
    .from("quotes")
    .insert({
      tenant_id: session.tenantId,
      created_by_id: session.userId,
      status: "draft",
      title,
      description,
      customer_name: parsed ? strOrNull(parsed.customer_name) : null,
      customer_email: parsed ? strOrNull(parsed.customer_email) : null,
      customer_phone: parsed ? strOrNull(parsed.customer_phone) : null,
      address1: parsed ? strOrNull(parsed.address1) : null,
      address2: parsed ? strOrNull(parsed.address2) : null,
      town: parsed ? strOrNull(parsed.town) : null,
      postcode: parsed ? strOrNull(parsed.postcode) : null,
      price: parsed ? priceHintFromParsed(parsed) : null,
      office_sales_pitch: parsed ? strOrNull(parsed.office_sales_pitch) : null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ quoteId: (quote as { id: string }).id });
}
