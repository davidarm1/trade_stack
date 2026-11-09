import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadToB2, publicUrlForB2Key } from "@/lib/b2";
import { b2DownloadPathForKey, publicUrlFromStoredValue } from "@/lib/b2-links";
import { buildStoredInvoicePdf } from "@/lib/invoice-pdf-store";
import { sendInvoiceEmail } from "@/lib/resend";
import { renderTradeCompanyEmail } from "@/emails/TradeCompanyEmail";
import { jobInvoiceEmailSubject } from "@/lib/job-number";
import { parseInvoiceRecipients } from "@/lib/invoice-recipients";
import { getInvoicePayLink } from "@/lib/pay-link";

export type InvoiceActor = { userId: string; membershipId: string | null };

/**
 * Builds the invoice PDF, stores it, emails it and marks the job invoiced.
 * Takes the Supabase client and actor explicitly so it can run both as the
 * signed-in user (server action) and as the service role (scheduled send).
 * The invoice is dated when this runs, so a scheduled send is dated that day.
 */
export async function sendJobInvoiceCore(args: {
  supabase: SupabaseClient;
  tenantId: string;
  actor: InvoiceActor;
  jobId: string;
  versionReason: string | null;
  recipientEmails: string;
}): Promise<{ data: { version_no: number; public_url: string } | null; error: string | null }> {
  const { supabase, tenantId, actor, jobId, versionReason, recipientEmails } = args;
  const parsed = parseInvoiceRecipients(recipientEmails);
  if (parsed.error) return { data: null, error: parsed.error };
  const recipients = parsed.recipients;

  const { data: jobMeta, error: jobMetaErr } = await supabase
    .from("jobs")
    .select("id, title, job_number, client_id, jobsheet_url")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (jobMetaErr || !jobMeta) return { data: null, error: jobMetaErr?.message ?? "Job not found." };

  const [{ data: tenant }, { data: settingRows }] = await Promise.all([
    supabase
      .from("tenants")
      .select("name, email, phone, logo_url, address1, address2, town, postcode")
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("field_key, field_value")
      .eq("tenant_id", tenantId),
  ]);
  const settings = Object.fromEntries(
    (settingRows ?? []).map((row) => [String(row.field_key), String(row.field_value ?? "")]),
  );
  const companyName =
    String(settings.company_name ?? tenant?.name ?? "").trim() || "your company";
  const companyPhone = String(
    settings.company_phone ?? settings.phone ?? tenant?.phone ?? "",
  ).trim();
  const companyEmail = String(
    settings.company_email ?? settings.email ?? tenant?.email ?? "",
  ).trim();
  const companyAddressLines = [
    settings.address_line_1 ?? settings.address1 ?? tenant?.address1,
    settings.address_line_2 ?? settings.address2 ?? tenant?.address2,
    settings.town ?? tenant?.town,
    settings.postcode ?? tenant?.postcode,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  const companyAddressText = companyAddressLines.join(", ");
  const companyLogoUrl = String(tenant?.logo_url ?? "").trim() || null;
  const companyContactParts = [
    companyAddressText,
    companyPhone ? `Tel: ${companyPhone}` : "",
    companyEmail ? `Email: ${companyEmail}` : "",
  ].filter(Boolean);

  const { data: versions, error: verErr } = await supabase
    .from("job_invoice_versions")
    .select("id, version_no")
    .eq("tenant_id", tenantId)
    .eq("job_id", jobId)
    .order("version_no", { ascending: false });
  if (verErr) return { data: null, error: verErr.message };
  const nextVersion = ((versions?.[0]?.version_no as number | undefined) ?? 0) + 1;
  const trimmedReason = String(versionReason ?? "").trim();
  if (nextVersion > 1 && !trimmedReason) {
    return {
      data: null,
      error: "Reason is required when sending invoice version v2 or later.",
    };
  }

  const { buffer, fileName } = await buildStoredInvoicePdf({
    supabase,
    tenantId: tenantId,
    jobId,
    versionNo: nextVersion,
  });
  const key = `tradestack/${tenantId}/invoices/${jobId}/v${nextVersion}_${fileName}`;
  await uploadToB2(buffer, key, "application/pdf");
  const downloadUrl = b2DownloadPathForKey(key);
  const publicInvoiceUrl = publicUrlForB2Key(key);

  const now = new Date().toISOString();

  const { error: clearErr } = await supabase
    .from("job_invoice_versions")
    .update({ is_current: false })
    .eq("tenant_id", tenantId)
    .eq("job_id", jobId)
    .eq("is_current", true);
  if (clearErr) return { data: null, error: clearErr.message };

  const { error: insErr } = await supabase.from("job_invoice_versions").insert({
    tenant_id: tenantId,
    job_id: jobId,
    version_no: nextVersion,
    reason: trimmedReason || null,
    file_name: fileName,
    b2_key: key,
    public_url: key,
    is_current: true,
    created_by_id: actor.userId,
    created_by_membership_id: actor.membershipId ?? null,
    created_at: now,
  });
  if (insErr) return { data: null, error: insErr.message };

  const { error: fileErr } = await supabase.from("tenant_files").insert({
    tenant_id: tenantId,
    job_id: jobId,
    file_type: "invoice",
    b2_key: key,
    file_name: fileName,
    file_size_bytes: buffer.length,
    public_url: key,
  });
  if (fileErr) return { data: null, error: fileErr.message };

  const subjectCore = jobInvoiceEmailSubject({
    jobNumber: jobMeta.job_number as number | null | undefined,
    title: String(jobMeta.title ?? "Invoice"),
  });
  const subject = `${companyName} — ${subjectCore}`;
  const storedJobSheetLink = publicUrlFromStoredValue(jobMeta.jobsheet_url);
  // Only present when the company has connected Stripe and there is an amount due.
  const payUrl = await getInvoicePayLink({ tenantId, jobId }).catch(() => null);
  const html = await renderTradeCompanyEmail({
    preview: `${companyName} invoice`,
    eyebrow: "Invoice",
    heading: `${companyName} invoice`,
    companyName,
    companyLogoUrl,
    companyContactLines: companyContactParts,
    intro: `Hello, please find the invoice for ${companyName} attached. The public links are below.`,
    primaryAction: { label: "Open invoice PDF", href: publicInvoiceUrl },
    secondaryActions: [
      ...(payUrl ? [{ label: "Pay online", href: payUrl }] : []),
      ...(storedJobSheetLink ? [{ label: "Open job sheet PDF", href: storedJobSheetLink }] : []),
    ],
    supportingText: trimmedReason ? `Reason for this version: ${trimmedReason}` : undefined,
    footerNote: `Sent via Trade Stack on behalf of ${companyName}.`,
  });
  const text = [
    "Hello,",
    "",
    `Please find the invoice for ${companyName} attached.`,
    "Public links are included below:",
    publicInvoiceUrl,
    "",
    companyName,
    ...companyContactParts,
    ...(payUrl ? ["", "Pay online:", payUrl] : []),
    ...(storedJobSheetLink ? ["", "Open job sheet PDF:", storedJobSheetLink] : []),
    trimmedReason ? `Reason for this version: ${trimmedReason}` : "",
    "",
    "If you have any questions, please reply to this email.",
    `Sent via Trade Stack on behalf of ${companyName}.`,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await sendInvoiceEmail({
      to: recipients,
      subject,
      html,
      text,
      fromName: companyName,
      replyTo: companyEmail || undefined,
      attachments: [
        {
          filename: fileName,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email send failed.";
    return {
      data: null,
      error: `Invoice PDF stored, but email sending failed: ${message}`,
    };
  }

  const { error: jobErr } = await supabase
    .from("jobs")
    .update({
      invoice_sent_at: now,
      invoice_sent_to_email: recipients.join(", "),
      updated_at: now,
      status: "invoiced",
    })
    .eq("id", jobId)
    .eq("tenant_id", tenantId);
  if (jobErr) return { data: null, error: jobErr.message };

  return { data: { version_no: nextVersion, public_url: downloadUrl }, error: null };
}
