import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuote } from "@/actions/quotes";
import { getTenantCurrencyCode } from "@/lib/tenant-currency";
import type { Quote } from "@/types/database";
import { EditQuoteForm } from "./edit-quote-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getQuote(id);
  const q = data as Quote | null;
  const t = (q?.title ?? "Quote").slice(0, 80);
  return { title: `${t} · Quote` };
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: quote, error }, currencyCode] = await Promise.all([
    getQuote(id),
    getTenantCurrencyCode(),
  ]);

  if (error || !quote) {
    notFound();
  }

  return (
    <div>
      <Link
        href="/quotes"
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to quotes
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Edit quote</h1>
      <p className="mt-1 text-sm text-slate-600">
        Update details, archive when lost, or create a job when the customer
        approves.
      </p>
      <EditQuoteForm quote={quote as Quote} currencyCode={currencyCode} />
    </div>
  );
}
