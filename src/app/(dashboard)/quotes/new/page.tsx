import Link from "next/link";
import { getTenantCurrencyCode } from "@/lib/tenant-currency";
import { NewQuoteForm } from "./new-quote-form";

export default async function NewQuotePage() {
  const currencyCode = await getTenantCurrencyCode();
  return (
    <div>
      <Link
        href="/quotes"
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to quotes
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">New quote</h1>
      <p className="mt-1 text-sm text-slate-600">
        Paste a quote request for AI prefill, or enter details manually.
      </p>
      <NewQuoteForm currencyCode={currencyCode} />
    </div>
  );
}
