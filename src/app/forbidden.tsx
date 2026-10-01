import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">403</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account doesn&apos;t have permission to view this page.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm font-medium text-slate-700 underline underline-offset-4"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
