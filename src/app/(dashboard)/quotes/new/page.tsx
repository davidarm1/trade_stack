import Link from "next/link";

export default function NewQuotePage() {
  return (
    <div>
      <Link
        href="/quotes"
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to quotes
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">New quote</h1>
      <p className="mt-2 text-sm text-slate-600">
        {/* TODO: Full quote builder with line items, PDF, and email send. */}
        Quote creation UI is not implemented yet — add a form wired to{" "}
        <code className="rounded bg-slate-100 px-1">createQuote</code> in{" "}
        <code className="rounded bg-slate-100 px-1">src/actions/quotes.ts</code>
        .
      </p>
    </div>
  );
}
