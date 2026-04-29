import Link from "next/link";
import { Suspense } from "react";
import OpenAI from "openai";
import { getQuotes } from "@/actions/quotes";
import { getSettingValue, upsertSettingValue } from "@/actions/settings";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatCurrency } from "@/lib/format-currency";
import {
  QUOTES_AI_PRICING_PROMPT_DEFAULT,
  QUOTES_AI_PRICING_PROMPT_KEY,
} from "@/lib/quotes-ai-pricing-prompt";
import { getTenantCurrencyCode } from "@/lib/tenant-currency";
import { QuoteRowActions } from "./quote-row-actions";
import { QuotesStatusFilter } from "./quotes-status-filter";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const currencyCode = await getTenantCurrencyCode();
  const { data: rows, error } = await getQuotes();
  const promptRes = await getSettingValue(QUOTES_AI_PRICING_PROMPT_KEY);
  const promptDefault = QUOTES_AI_PRICING_PROMPT_DEFAULT;
  const currentPrompt = promptRes.data?.trim() || promptDefault;
  const statusFilter = params.status ?? "";
  const promptSaveError =
    typeof params.promptError === "string" ? params.promptError : null;
  const promptSaveOk = params.promptSaved === "1";

  async function savePrompt(formData: FormData) {
    "use server";
    const prompt = String(formData.get("prompt") ?? "").trim();
    const { error: saveErr } = await upsertSettingValue(
      QUOTES_AI_PRICING_PROMPT_KEY,
      prompt || promptDefault,
    );
    if (saveErr) {
      redirect(
        `/quotes?promptError=${encodeURIComponent(saveErr.slice(0, 400))}`,
      );
    }
    redirect("/quotes?promptSaved=1");
  }

  async function priceWithAi(formData: FormData) {
    "use server";
    const quoteId = String(formData.get("quoteId") ?? "").trim();
    if (!quoteId) return;

    const ctx = await getTenantContext();
    if (!ctx.success) return;
    const supabase = await createClient();

    const { data: quote } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .eq("tenant_id", ctx.tenantId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!quote || quote.status === "booked") return;

    const setRes = await getSettingValue(QUOTES_AI_PRICING_PROMPT_KEY);
    const masterPrompt = setRes.data?.trim() || promptDefault;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return;

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a UK trade quoting assistant. Return JSON only: {\"price\": number, \"reason\": string}.",
        },
        {
          role: "user",
          content: [
            `Master pricing prompt: ${masterPrompt}`,
            `Quote title: ${quote.title ?? ""}`,
            `Quote description: ${quote.description ?? ""}`,
            `Customer: ${quote.customer_name ?? ""}`,
            `Town: ${quote.town ?? ""}`,
          ].join("\n"),
        },
      ],
    });

    let parsedPrice: number | null = null;
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
        price?: unknown;
      };
      parsedPrice =
        typeof parsed.price === "number" && Number.isFinite(parsed.price)
          ? parsed.price
          : null;
    } catch {
      parsedPrice = null;
    }
    if (parsedPrice == null) return;

    await supabase
      .from("quotes")
      .update({
        price: parsedPrice,
        status: "quoted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId)
      .eq("tenant_id", ctx.tenantId);

    const usage = completion.usage;
    await supabase.from("ai_usage").insert({
      tenant_id: ctx.tenantId,
      feature: "quote_price",
      model: "gpt-4o-mini",
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      cost_usd: null,
    });

    revalidatePath("/quotes");
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  const list = (rows ?? []).filter((q: { status?: string | null }) => {
    if (!statusFilter) return true;
    return (q.status ?? "") === statusFilter;
  });

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Quotes</h1>
          <p className="mt-1 text-sm text-slate-600">
            Estimates and proposals for your customers.
          </p>
        </div>
        <Link
          href="/quotes/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New Quote
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="mt-6 h-10 w-48 animate-pulse rounded-md bg-slate-100" />
        }
      >
        <QuotesStatusFilter />
      </Suspense>

      {promptSaveOk ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          AI pricing prompt saved.
        </div>
      ) : null}
      {promptSaveError ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          Could not save prompt: {promptSaveError}
        </div>
      ) : null}

      <details className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          AI pricing master prompt
        </summary>
        <form action={savePrompt} className="mt-3">
          <textarea
            name="prompt"
            defaultValue={currentPrompt}
            rows={4}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
          <div className="mt-2">
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Save prompt
            </button>
          </div>
        </form>
      </details>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Title
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Customer
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Price
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Date
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                AI
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No quotes yet.
                </td>
              </tr>
            ) : (
              list.map(
                (q: {
                  id: string;
                  title?: string | null;
                  customer_name?: string | null;
                  price?: number | null;
                  status?: string | null;
                  quote_date?: string | null;
                  booked_job_id?: string | null;
                }) => (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="text-slate-900 underline-offset-2 hover:text-slate-700 hover:underline"
                      >
                        {q.title ?? "Untitled"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {q.customer_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {q.price != null
                        ? formatCurrency(q.price, currencyCode)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {q.status ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {q.quote_date
                        ? new Date(q.quote_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <form action={priceWithAi}>
                        <input type="hidden" name="quoteId" value={q.id} />
                        <button
                          type="submit"
                          disabled={q.status === "booked"}
                          className="inline-flex items-center rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            q.status === "booked"
                              ? "Quote already booked"
                              : "Price this quote with AI"
                          }
                        >
                          AI
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <QuoteRowActions
                        quoteId={q.id}
                        status={q.status ?? null}
                        bookedJobId={q.booked_job_id ?? null}
                      />
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
