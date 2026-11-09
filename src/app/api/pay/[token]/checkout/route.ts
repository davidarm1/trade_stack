import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { appOrigin, getStripe, stripeConfigured } from "@/lib/stripe";
import { isPayToken, toMinorUnits } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts a Stripe Checkout session for an invoice. The amount is read from the
 * database here — nothing about the price comes from the browser.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const origin = appOrigin(new URL(request.url).origin);
  const back = (reason: string) =>
    NextResponse.redirect(`${origin}/pay/${token}?error=${reason}`, 303);

  if (!isPayToken(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!stripeConfigured()) return back("unavailable");

  const admin = createServiceRoleClient();
  const { data: job } = await admin
    .from("jobs")
    .select(
      "id, tenant_id, job_number, title, total_inc_vat, payment_status, invoice_paid_at, invoice_sent_at, deleted_at",
    )
    .eq("invoice_pay_token", token)
    .maybeSingle();
  if (!job || job.deleted_at) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!job.invoice_sent_at) return back("unavailable");
  if (job.invoice_paid_at || String(job.payment_status ?? "").toLowerCase() === "paid") {
    return NextResponse.redirect(`${origin}/pay/${token}`, 303);
  }

  const [{ data: account }, { data: tenant }] = await Promise.all([
    admin
      .from("tenant_payment_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("tenant_id", job.tenant_id)
      .maybeSingle(),
    admin.from("tenants").select("name, currency").eq("id", job.tenant_id).maybeSingle(),
  ]);
  if (!account?.charges_enabled) return back("unavailable");

  const currency = String(tenant?.currency ?? "GBP").toLowerCase();
  const amount = toMinorUnits(job.total_inc_vat, currency);
  if (!amount) return back("unavailable");

  const label = `Invoice JOB-${job.job_number ?? ""} — ${String(job.title ?? "Services").slice(0, 120)}`;
  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: job.id,
        metadata: { job_id: job.id, tenant_id: job.tenant_id },
        payment_intent_data: { metadata: { job_id: job.id, tenant_id: job.tenant_id } },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amount,
              product_data: { name: label },
            },
          },
        ],
        success_url: `${origin}/pay/${token}?paid=1`,
        cancel_url: `${origin}/pay/${token}`,
      },
      { stripeAccount: account.stripe_account_id as string },
    );
    if (!session.url) return back("unavailable");
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error("[pay] checkout session failed:", e);
    return back("failed");
  }
}
