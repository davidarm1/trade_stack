import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { appOrigin, stripeConfigured } from "@/lib/stripe";
import { toMinorUnits } from "@/lib/payments";

/**
 * Public pay link for a job's invoice, or null when online payment isn't
 * possible (Stripe not configured, company not connected/enabled, no amount
 * due, or already paid).
 */
export async function getInvoicePayLink(args: {
  tenantId: string;
  jobId: string;
}): Promise<string | null> {
  if (!stripeConfigured()) return null;
  const admin = createServiceRoleClient();
  const [{ data: account }, { data: job }, { data: tenant }] = await Promise.all([
    admin
      .from("tenant_payment_accounts")
      .select("charges_enabled")
      .eq("tenant_id", args.tenantId)
      .maybeSingle(),
    admin
      .from("jobs")
      .select("invoice_pay_token, total_inc_vat, payment_status, invoice_paid_at")
      .eq("id", args.jobId)
      .eq("tenant_id", args.tenantId)
      .maybeSingle(),
    admin.from("tenants").select("currency").eq("id", args.tenantId).maybeSingle(),
  ]);
  if (!account?.charges_enabled || !job?.invoice_pay_token) return null;
  if (job.invoice_paid_at || String(job.payment_status ?? "").toLowerCase() === "paid") {
    return null;
  }
  if (!toMinorUnits(job.total_inc_vat, tenant?.currency)) return null;
  const origin = appOrigin();
  if (!origin) return null;
  return `${origin}/pay/${job.invoice_pay_token}`;
}
