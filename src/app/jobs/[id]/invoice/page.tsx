import { redirect } from "next/navigation";
import { resolveBrandingFromSettings } from "@/lib/branding-settings";
import { createClient } from "@/lib/supabase/server";
import { compactTemplateBlock, multilineTemplateBlock, renderTemplateText } from "@/lib/text-template";
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
      ? supabase.from("clients").select("*").eq("id", job.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("job_materials")
      .select("*")
      .eq("job_id", id)
      .eq("tenant_id", job.tenant_id)
      .order("sort_order", { ascending: true }),
  ]);

  const settingsRows = await supabase
    .from("settings")
    .select("field_key, field_value")
    .eq("tenant_id", job.tenant_id);
  const settings = Object.fromEntries(
    (settingsRows.data ?? []).map((r) => [String(r.field_key), String(r.field_value ?? "")]),
  );
  const { showLogo, showName } = resolveBrandingFromSettings(settings);
  const companyLogoUrl = String(tenant?.logo_url ?? "").trim() || null;
  const footerTemplate = String(settings.invoice_footer_text || tenant?.invoice_footer_text || "").trim();
  const vatRegistered = Boolean(String(tenant?.vat_number ?? "").trim());
  const footerValues = {
    company_name: String(settings.company_name || tenant?.name || "").trim(),
    address: compactTemplateBlock([
      settings.address_line_1 || settings.company_address1 || tenant?.address1,
      settings.address_line_2 || settings.company_address2 || tenant?.address2,
      settings.town || settings.company_town || tenant?.town,
      settings.postcode || settings.company_postcode || tenant?.postcode,
    ]),
    address_block: multilineTemplateBlock([
      settings.address_line_1 || settings.company_address1 || tenant?.address1,
      settings.address_line_2 || settings.company_address2 || tenant?.address2,
      settings.town || settings.company_town || tenant?.town,
      settings.postcode || settings.company_postcode || tenant?.postcode,
    ]),
    email: String(settings.email || settings.company_email || tenant?.email || "").trim(),
    phone: String(settings.phone || settings.company_phone || tenant?.phone || "").trim(),
    company_no: String(tenant?.company_reg_number || "").trim(),
    vat_no: vatRegistered ? String(tenant?.vat_number || "").trim() : "",
    bank_name: String(settings.bank_name || tenant?.bank_name || "").trim(),
    bank_account_name: String(settings.bank_account_name || tenant?.bank_account_name || "").trim(),
    bank_account_number: String(settings.bank_account_number || tenant?.bank_account_number || "").trim(),
    bank_sort_code: String(settings.bank_sort_code || tenant?.bank_sort_code || "").trim(),
    bank_iban: String(settings.bank_iban || tenant?.bank_iban || "").trim(),
    bank_swift: String(settings.bank_swift || tenant?.bank_swift || "").trim(),
    bank_details: multilineTemplateBlock([
      settings.bank_account_name || tenant?.bank_account_name
        ? `Account name: ${settings.bank_account_name || tenant?.bank_account_name}`
        : null,
      settings.bank_name || tenant?.bank_name ? `Bank: ${settings.bank_name || tenant?.bank_name}` : null,
      settings.bank_sort_code || tenant?.bank_sort_code ? `Sort code: ${settings.bank_sort_code || tenant?.bank_sort_code}` : null,
      settings.bank_account_number || tenant?.bank_account_number ? `Account number: ${settings.bank_account_number || tenant?.bank_account_number}` : null,
      settings.bank_iban || tenant?.bank_iban ? `IBAN: ${settings.bank_iban || tenant?.bank_iban}` : null,
      settings.bank_swift || tenant?.bank_swift ? `SWIFT/BIC: ${settings.bank_swift || tenant?.bank_swift}` : null,
    ]),
    bank_details_inline: compactTemplateBlock([
      settings.bank_account_name || tenant?.bank_account_name ? `Account name: ${settings.bank_account_name || tenant?.bank_account_name}` : null,
      settings.bank_name || tenant?.bank_name ? `Bank: ${settings.bank_name || tenant?.bank_name}` : null,
      settings.bank_sort_code || tenant?.bank_sort_code ? `Sort code: ${settings.bank_sort_code || tenant?.bank_sort_code}` : null,
      settings.bank_account_number || tenant?.bank_account_number ? `Account number: ${settings.bank_account_number || tenant?.bank_account_number}` : null,
      settings.bank_iban || tenant?.bank_iban ? `IBAN: ${settings.bank_iban || tenant?.bank_iban}` : null,
      settings.bank_swift || tenant?.bank_swift ? `SWIFT/BIC: ${settings.bank_swift || tenant?.bank_swift}` : null,
    ]),
  };
  const invoiceFooterText = renderTemplateText(footerTemplate, footerValues).trim() || "Thank you for your business.";
  const footerUsesBankDetails = /##(?:bank_[a-z0-9_]+|bank_details)##|\{\{(?:bank_[a-z0-9_]+|bank_details)\}\}/i.test(footerTemplate);

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
        bankAccountName: String(
          settings.bank_account_name || tenant?.bank_account_name || "",
        ).trim(),
        bankName: String(settings.bank_name || tenant?.bank_name || "").trim(),
        bankSortCode: String(
          settings.bank_sort_code || tenant?.bank_sort_code || "",
        ).trim(),
        bankAccountNumber: String(
          settings.bank_account_number || tenant?.bank_account_number || "",
        ).trim(),
        bankIBAN: String(settings.bank_iban || tenant?.bank_iban || "").trim(),
        bankSwift: String(settings.bank_swift || tenant?.bank_swift || "").trim(),
        invoiceFooterText,
        showPaymentDetails: !footerUsesBankDetails,
        showVatLine: vatRegistered,
        invoiceNumber: String(job.custom_invoice_number || `INV-${id.slice(0, 8)}`).trim(),
        invoiceDate: new Date().toLocaleDateString("en-GB"),
        dueDate: new Date(
          Date.now() + Number((job.payment_terms_days ?? tenant?.default_payment_terms_days ?? 30) || 30) * 24 * 60 * 60 * 1000,
        ).toLocaleDateString("en-GB"),
        jobReference: String(job.job_number ?? "").trim() || id.slice(0, 8),
        clientName: String(client?.company_name || client?.contact_name || "").trim(),
        billingAddress1: String(client?.address1 || "").trim(),
        billingAddress2: String(client?.address2 || "").trim(),
        billingTown: String(client?.town || "").trim(),
        billingPostcode: String(client?.postcode || "").trim(),
        siteAddress1: String(job.site_address1 || client?.site_address1 || client?.address1 || "").trim(),
        siteAddress2: String(job.site_address2 || client?.site_address2 || client?.address2 || "").trim(),
        siteTown: String(job.site_town || client?.site_town || client?.town || "").trim(),
        sitePostcode: String(job.site_postcode || client?.site_postcode || client?.postcode || "").trim(),
        currency: String(tenant?.currency || "GBP").toUpperCase(),
        subtotal: Number(job.subtotal ?? 0),
        vatAmount: vatRegistered
          ? Number(job.vat_amount ?? 0)
          : 0,
        total: vatRegistered
          ? Number(job.total_inc_vat ?? Number(job.subtotal ?? 0) + Number(job.vat_amount ?? 0))
          : Number(job.subtotal ?? 0),
        vatRate: vatRegistered
          ? Number(job.vat_rate ?? settings.default_vat_rate ?? tenant?.default_vat_rate ?? 0)
          : 0,
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
