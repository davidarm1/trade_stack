"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { appOrigin, getStripe, stripeConfigured } from "@/lib/stripe";
import { getInvoicePayLink } from "@/lib/pay-link";

export type PaymentAccountStatus = {
  platformConfigured: boolean;
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  canManage: boolean;
};

/** Only the company owner may connect or change the payout account. */
async function requireOwner() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { ok: false as const, error: ctx.error };
  const admin = createServiceRoleClient();
  let role: string | null = null;
  if (ctx.membershipId) {
    const { data } = await admin
      .from("memberships")
      .select("role")
      .eq("id", ctx.membershipId)
      .maybeSingle();
    role = (data?.role as string | undefined) ?? null;
  }
  if (!role) {
    const { data } = await admin.from("users").select("role").eq("id", ctx.userId).maybeSingle();
    role = (data?.role as string | undefined) ?? null;
  }
  if (role !== "owner") {
    return { ok: false as const, error: "Only the company owner can manage online payments." };
  }
  return { ok: true as const, ctx, admin };
}

export async function getPaymentAccountStatus(): Promise<{
  data: PaymentAccountStatus | null;
  error: string | null;
}> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const admin = createServiceRoleClient();
  const [{ data: account }, { data: m }] = await Promise.all([
    admin
      .from("tenant_payment_accounts")
      .select("charges_enabled, payouts_enabled, details_submitted")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle(),
    ctx.membershipId
      ? admin.from("memberships").select("role").eq("id", ctx.membershipId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    data: {
      platformConfigured: stripeConfigured(),
      connected: Boolean(account),
      chargesEnabled: Boolean(account?.charges_enabled),
      payoutsEnabled: Boolean(account?.payouts_enabled),
      detailsSubmitted: Boolean(account?.details_submitted),
      canManage: (m?.role as string | undefined) === "owner",
    },
    error: null,
  };
}

/** Create (or resume) the company's Stripe account and return Stripe's onboarding URL. */
export async function startStripeOnboarding(): Promise<{ url: string | null; error: string | null }> {
  if (!stripeConfigured()) return { url: null, error: "Online payments are not set up on this platform yet." };
  const owner = await requireOwner();
  if (!owner.ok) return { url: null, error: owner.error };
  const { ctx, admin } = owner;

  try {
    const stripe = getStripe();
    const { data: existing } = await admin
      .from("tenant_payment_accounts")
      .select("stripe_account_id")
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    let accountId = existing?.stripe_account_id as string | undefined;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "standard",
        metadata: { tenant_id: ctx.tenantId },
      });
      accountId = account.id;
      const { error } = await admin.from("tenant_payment_accounts").insert({
        tenant_id: ctx.tenantId,
        stripe_account_id: accountId,
      });
      if (error) return { url: null, error: error.message };
    }

    const origin = appOrigin();
    if (!origin) return { url: null, error: "NEXT_PUBLIC_APP_URL is not set on the server." };
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/settings?stripe=refresh`,
      return_url: `${origin}/settings?stripe=return`,
      type: "account_onboarding",
    });
    return { url: link.url, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : "Could not start Stripe setup." };
  }
}

/** Pull the latest capability flags from Stripe (after onboarding, or on demand). */
export async function refreshStripeAccount(): Promise<{ error: string | null }> {
  if (!stripeConfigured()) return { error: null };
  const ctx = await getTenantContext();
  if (!ctx.success) return { error: ctx.error };
  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("tenant_payment_accounts")
    .select("stripe_account_id")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!existing) return { error: null };
  try {
    const account = await getStripe().accounts.retrieve(existing.stripe_account_id as string);
    await admin
      .from("tenant_payment_accounts")
      .update({
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", ctx.tenantId);
    revalidatePath("/settings");
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not refresh Stripe status." };
  }
}

/** Stop using the connected account here. The Stripe account itself is not touched. */
export async function disconnectStripe(): Promise<{ error: string | null }> {
  const owner = await requireOwner();
  if (!owner.ok) return { error: owner.error };
  const { error } = await owner.admin
    .from("tenant_payment_accounts")
    .delete()
    .eq("tenant_id", owner.ctx.tenantId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { error: null };
}

/** Pay link and recorded online payments for one job (office view). */
export async function getJobPaymentInfo(jobId: string): Promise<{
  payUrl: string | null;
  payments: { id: string; amount_minor: number; currency: string; paid_at: string }[];
}> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { payUrl: null, payments: [] };
  const admin = createServiceRoleClient();
  const [payUrl, { data: rows }] = await Promise.all([
    getInvoicePayLink({ tenantId: ctx.tenantId, jobId }),
    admin
      .from("job_payments")
      .select("id, amount_minor, currency, paid_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("job_id", jobId)
      .order("paid_at", { ascending: true }),
  ]);
  return {
    payUrl,
    payments: (rows ?? []).map((r) => ({
      id: r.id as string,
      amount_minor: Number(r.amount_minor),
      currency: String(r.currency),
      paid_at: String(r.paid_at),
    })),
  };
}
