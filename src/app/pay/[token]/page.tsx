import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { formatMinor, isPayToken, toMinorUnits } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay invoice", robots: { index: false, follow: false } };

export default async function PayInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  const { token } = await params;
  const { paid, error } = await searchParams;
  if (!isPayToken(token)) notFound();

  const admin = createServiceRoleClient();
  const { data: job } = await admin
    .from("jobs")
    .select(
      "id, tenant_id, job_number, title, total_inc_vat, payment_status, invoice_paid_at, invoice_sent_at, deleted_at",
    )
    .eq("invoice_pay_token", token)
    .maybeSingle();
  if (!job || job.deleted_at) notFound();

  const [{ data: tenant }, { data: account }] = await Promise.all([
    admin.from("tenants").select("name, email, phone, currency").eq("id", job.tenant_id).maybeSingle(),
    admin
      .from("tenant_payment_accounts")
      .select("charges_enabled")
      .eq("tenant_id", job.tenant_id)
      .maybeSingle(),
  ]);

  const company = String(tenant?.name ?? "").trim() || "the supplier";
  const currency = String(tenant?.currency ?? "GBP");
  const minor = toMinorUnits(job.total_inc_vat, currency);
  const isPaid =
    Boolean(job.invoice_paid_at) || String(job.payment_status ?? "").toLowerCase() === "paid";
  const canPay =
    stripeConfigured() && Boolean(account?.charges_enabled) && Boolean(job.invoice_sent_at) && minor != null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">{company}</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">
          Invoice JOB-{job.job_number ?? ""}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{String(job.title ?? "")}</p>

        {minor != null ? (
          <p className="mt-5 text-3xl font-semibold text-slate-900">{formatMinor(minor, currency)}</p>
        ) : null}

        {isPaid ? (
          <p className="mt-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            This invoice has been paid. Thank you.
          </p>
        ) : paid ? (
          <p className="mt-5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Thank you — your payment is being confirmed. You will not be charged twice.
          </p>
        ) : canPay ? (
          <>
            {error ? (
              <p className="mt-5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                We couldn&apos;t start the payment. Please try again.
              </p>
            ) : null}
            <form method="POST" action={`/api/pay/${token}/checkout`} className="mt-5">
              <button
                type="submit"
                className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                Pay by card
              </button>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              Secure payment by Stripe. Your card details are never shared with {company}.
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Online payment isn&apos;t available for this invoice. Please contact {company}
            {tenant?.email ? ` at ${String(tenant.email)}` : ""}
            {tenant?.phone ? ` or ${String(tenant.phone)}` : ""}.
          </p>
        )}
      </div>
    </main>
  );
}
