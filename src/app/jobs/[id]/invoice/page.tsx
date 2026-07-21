import { redirect } from "next/navigation";
import { resolveBrandingFromSettings } from "@/lib/branding-settings";
import { createClient } from "@/lib/supabase/server";
import { resolveEffectiveVat } from "@/lib/effective-vat";
import { InvoiceView } from "./invoice-view";

export default async function JobInvoiceStandalonePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job) redirect("/jobs");

  const [{ data: tenant }, { data: client }, { data: materials }] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", job.tenant_id).maybeSingle(),
    job.client_id
      ? supabase
          .from("clients")
          .select("*")
          .eq("id", job.client_id)
          .eq("tenant_id", job.tenant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("job_materials")
      .select("*")
      .eq("job_id", id)
      .eq("tenant_id", job.tenant_id)
      .order("sort_order", { ascending: true }),
  ]);
  if (!tenant) redirect("/jobs");

  const settingsRows = await supabase
    .from("settings")
    .select("field_key, field_value")
    .eq("tenant_id", job.tenant_id);
  const settings = Object.fromEntries(
    (settingsRows.data ?? []).map((r) => [String(r.field_key), String(r.field_value ?? "")]),
  );
  const { showLogo, showName } = resolveBrandingFromSettings(settings);
  const companyLogoUrl = String(tenant?.logo_url ?? "").trim() || null;
  const effectiveVat = resolveEffectiveVat({
    tenant,
    client,
    job,
    subtotal: Number(job.subtotal ?? 0),
  });

  return (
    <InvoiceView
      jobId={id}
      fileName={`invoice-${id}.pdf`}
      brandingShowLogo={Boolean(showLogo && companyLogoUrl)}
      brandingShowCompanyName={showName}
      companyLogoUrl={companyLogoUrl}
      invoice={{
        companyName: String(settings.company_name || tenant?.name || "").trim(),
        companyAddress1: String(
          settings.address_line_1 || settings.company_address1 || tenant?.address1 || "",
        ).trim(),
        companyAddress2: String(
          settings.address_line_2 || settings.company_address2 || tenant?.address2 || "",
        ).trim(),
        companyTown: String(settings.town || settings.company_town || tenant?.town || "").trim(),
        companyPostcode: String(
          settings.postcode || settings.company_postcode || tenant?.postcode || "",
        ).trim(),
        companyPhone: String(
          settings.phone || settings.company_phone || tenant?.phone || "",
        ).trim(),
        companyEmail: String(
          settings.email || settings.company_email || tenant?.email || "",
        ).trim(),
        invoiceNumber: String(job.custom_invoice_number || `INV-${id.slice(0, 8)}`).trim(),
        invoiceDate: new Date().toLocaleDateString("en-GB"),
        dueDate: new Date(
          Date.now() + Number((job.payment_terms_days ?? tenant?.default_payment_terms_days ?? 30) || 30) * 24 * 60 * 60 * 1000,
        ).toLocaleDateString("en-GB"),
        jobReference: String(job.job_number ?? "").trim() || id.slice(0, 8),
        clientName: String(client?.company_name || client?.contact_name || "").trim(),
        clientAddress1: String(
          job.site_address1 || client?.site_address1 || client?.address1 || "",
        ).trim(),
        clientAddress2: String(
          job.site_address2 || client?.site_address2 || client?.address2 || "",
        ).trim(),
        clientTown: String(job.site_town || client?.site_town || client?.town || "").trim(),
        clientPostcode: String(
          job.site_postcode || client?.site_postcode || client?.postcode || "",
        ).trim(),
        currency: String(tenant?.currency || "GBP").toUpperCase(),
        subtotal: Number(job.subtotal ?? 0),
        showVat: effectiveVat.showVat,
        vatAmount: effectiveVat.vatAmount,
        total: effectiveVat.totalIncVat,
        vatRate: effectiveVat.rate,
        lineItems: (materials ?? []).map((m) => ({
          id: m.id,
          item: String(m.description || "").trim(),
          qty: Number(m.quantity ?? 0),
          unitPrice: Number(m.unit_price ?? 0),
          lineTotal: Number(m.total_price ?? 0),
        })),
      }}
    />
  );
}
