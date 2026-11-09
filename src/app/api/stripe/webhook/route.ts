import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { toMinorUnits } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createServiceRoleClient>;

async function recordPaidSession(admin: Admin, connectedAccountId: string, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  const jobId = session.metadata?.job_id ?? session.client_reference_id;
  if (!jobId) return;

  const { data: job } = await admin
    .from("jobs")
    .select("id, tenant_id, total_inc_vat, payment_status, invoice_paid_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;

  // The event must come from the Stripe account this company connected, so one
  // company can never mark another company's job paid.
  const { data: account } = await admin
    .from("tenant_payment_accounts")
    .select("stripe_account_id")
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (!account || account.stripe_account_id !== connectedAccountId) {
    console.warn("[stripe] account mismatch for job", jobId);
    return;
  }

  const amountMinor = Number(session.amount_total ?? 0);
  const currency = String(session.currency ?? "gbp").toLowerCase();
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  // Unique on the session id, so a repeated webhook can't double-record.
  const { error: insErr } = await admin.from("job_payments").insert({
    tenant_id: job.tenant_id,
    job_id: job.id,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntent,
    amount_minor: amountMinor,
    currency,
    status: "paid",
  });
  if (insErr && insErr.code !== "23505") throw new Error(insErr.message);

  // Mark the job paid only if the payment covers what is currently owed.
  const alreadyPaid =
    Boolean(job.invoice_paid_at) || String(job.payment_status ?? "").toLowerCase() === "paid";
  const owed = toMinorUnits(job.total_inc_vat, currency);
  if (!alreadyPaid && owed != null && amountMinor >= owed) {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("jobs")
      .update({ invoice_paid_at: now, payment_status: "paid", updated_at: now })
      .eq("id", job.id)
      .eq("tenant_id", job.tenant_id);
    if (error) throw new Error(error.message);
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is not configured." }, { status: 500 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Signature verification needs the exact raw body.
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      if (event.account) {
        await recordPaidSession(admin, event.account, event.data.object as Stripe.Checkout.Session);
      }
    } else if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      await admin
        .from("tenant_payment_accounts")
        .update({
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_account_id", account.id);
    }
  } catch (e) {
    console.error("[stripe] webhook handling failed:", e);
    // Non-2xx makes Stripe retry, and the insert above is idempotent.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
