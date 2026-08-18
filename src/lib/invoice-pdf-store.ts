import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { resolveBrandingFromSettings } from "@/lib/branding-settings";
import { fetchLogoBytes } from "@/lib/fetch-logo-bytes";
import { compactTemplateBlock, multilineTemplateBlock } from "@/lib/text-template";
import { resolveInvoiceFooterText } from "@/lib/invoice-footer";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function drawRight(args: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  rightX: number;
  y: number;
  size: number;
  color?: ReturnType<typeof rgb>;
}) {
  const { page, font, text, rightX, y, size, color } = args;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [String(text || "")];
}

export async function buildStoredInvoicePdf(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobId: string;
  versionNo: number;
}): Promise<{ buffer: Buffer; fileName: string }> {
  const { supabase, tenantId, jobId, versionNo } = args;
  const [{ data: job }, { data: tenant }, { data: settingsRows }, { data: client }, { data: materials }] =
    await Promise.all([
      supabase.from("jobs").select("*").eq("id", jobId).eq("tenant_id", tenantId).maybeSingle(),
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase.from("settings").select("field_key, field_value").eq("tenant_id", tenantId),
      supabase
        .from("jobs")
        .select("client_id")
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .maybeSingle()
        .then(async (r) =>
          r.data?.client_id
            ? supabase.from("clients").select("*").eq("id", r.data.client_id).maybeSingle()
            : ({ data: null, error: null } as const),
        ),
      supabase
        .from("job_materials")
        .select("*")
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true }),
    ]);

  if (!job) {
    throw new Error("Job not found for invoice generation");
  }

  const settings = Object.fromEntries(
    (settingsRows ?? []).map((r) => [String(r.field_key), String(r.field_value ?? "")]),
  );
  const companyName = String(settings.company_name || tenant?.name || "").trim() || "Company";
  const fromLines = [
    settings.address_line_1 || settings.company_address1 || tenant?.address1 || "",
    settings.address_line_2 || settings.company_address2 || tenant?.address2 || "",
    [settings.town || settings.company_town || tenant?.town || "", settings.postcode || settings.company_postcode || tenant?.postcode || ""]
      .filter(Boolean)
      .join(" "),
    settings.phone || settings.company_phone || tenant?.phone || "",
    settings.email || settings.company_email || tenant?.email || "",
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const companyAddressLines = [
    settings.address_line_1 || settings.company_address1 || tenant?.address1 || "",
    settings.address_line_2 || settings.company_address2 || tenant?.address2 || "",
    settings.town || settings.company_town || tenant?.town || "",
    settings.postcode || settings.company_postcode || tenant?.postcode || "",
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const bankLines = [
    settings.bank_account_name || tenant?.bank_account_name
      ? `Account name: ${settings.bank_account_name || tenant?.bank_account_name}`
      : null,
    settings.bank_name || tenant?.bank_name ? `Bank: ${settings.bank_name || tenant?.bank_name}` : null,
    settings.bank_sort_code || tenant?.bank_sort_code ? `Sort code: ${settings.bank_sort_code || tenant?.bank_sort_code}` : null,
    settings.bank_account_number || tenant?.bank_account_number
      ? `Account number: ${settings.bank_account_number || tenant?.bank_account_number}`
      : null,
    settings.bank_iban || tenant?.bank_iban ? `IBAN: ${settings.bank_iban || tenant?.bank_iban}` : null,
    settings.bank_swift || tenant?.bank_swift ? `SWIFT/BIC: ${settings.bank_swift || tenant?.bank_swift}` : null,
  ].filter(Boolean) as string[];
  const footerTemplate = String(settings.invoice_footer_text || tenant?.invoice_footer_text || "").trim();
  const footerValues = {
    company_name: companyName,
    address: compactTemplateBlock(companyAddressLines),
    address_block: multilineTemplateBlock(companyAddressLines),
    email:
      String(settings.email || settings.company_email || tenant?.email || "")
        .trim(),
    phone:
      String(settings.phone || settings.company_phone || tenant?.phone || "")
        .trim(),
    company_no: String(tenant?.company_reg_number ?? "").trim(),
    vat_no: String(tenant?.vat_number ?? "").trim(),
    bank_name: String(settings.bank_name || tenant?.bank_name || "").trim(),
    bank_account_name: String(
      settings.bank_account_name || tenant?.bank_account_name || "",
    ).trim(),
    bank_account_number: String(
      settings.bank_account_number || tenant?.bank_account_number || "",
    ).trim(),
    bank_sort_code: String(settings.bank_sort_code || tenant?.bank_sort_code || "").trim(),
    bank_iban: String(settings.bank_iban || tenant?.bank_iban || "").trim(),
    bank_swift: String(settings.bank_swift || tenant?.bank_swift || "").trim(),
    bank_details: multilineTemplateBlock(bankLines),
    bank_details_inline: compactTemplateBlock(bankLines),
  };
  const invoiceFooterText = resolveInvoiceFooterText({
    template: footerTemplate,
    values: footerValues,
    paymentTermsDays: Number(job.payment_terms_days ?? tenant?.default_payment_terms_days ?? 30),
  });

  const billingTo = [
    client?.company_name || client?.contact_name || "",
    client?.address1 || "",
    client?.address2 || "",
    [client?.town || "", client?.postcode || ""]
      .filter(Boolean)
      .join(" "),
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  const siteTo = [
    job.site_address1 || client?.site_address1 || client?.address1 || "",
    job.site_address2 || client?.site_address2 || client?.address2 || "",
    [job.site_town || client?.site_town || client?.town || "", job.site_postcode || client?.site_postcode || client?.postcode || ""]
      .filter(Boolean)
      .join(" "),
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  const currency = String(tenant?.currency || "GBP").toUpperCase();
  const invoiceNumber =
    String(job.custom_invoice_number || `INV-${String(job.id).slice(0, 8)}-v${versionNo}`).trim();
  const fileName = `${invoiceNumber.replace(/[^\w-]+/g, "_")}.pdf`;
  const invoiceDate = new Date();
  const termsDays = Number(job.payment_terms_days ?? tenant?.default_payment_terms_days ?? 30);
  const dueDate = new Date(invoiceDate.getTime() + termsDays * 24 * 60 * 60 * 1000);

  const { showLogo: wantLogo, showName: wantName } = resolveBrandingFromSettings(settings);
  const logoUrl =
    String(tenant?.logo_url ?? "").trim() ||
    String(settings.logo_url ?? "").trim() ||
    null;
  const { bytes: logoBytes, mime: logoMime } =
    wantLogo && logoUrl
      ? await fetchLogoBytes(logoUrl)
      : { bytes: null, mime: "" };

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 38;
  const right = 595.28 - margin;
  const NAVY = rgb(26 / 255, 46 / 255, 74 / 255);
  const TEXT = rgb(30 / 255, 41 / 255, 59 / 255);
  let y = 802;

  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (logoBytes) {
    const urlLower = String(logoUrl ?? "").toLowerCase();
    try {
      if (logoMime.includes("png") || urlLower.includes(".png")) {
        logo = await pdf.embedPng(logoBytes);
      } else if (
        logoMime.includes("jpeg") ||
        logoMime.includes("jpg") ||
        urlLower.includes(".jpg") ||
        urlLower.includes(".jpeg")
      ) {
        logo = await pdf.embedJpg(logoBytes);
      }
    } catch {
      logo = null;
    }
  }

  page.drawText("INVOICE", { x: right - 102, y, size: 18, font: bold, color: NAVY });
  y -= 24;
  page.drawText(`Invoice: ${invoiceNumber}`, { x: right - 150, y, size: 10, font, color: TEXT });
  y -= 15;
  page.drawText(`Date: ${invoiceDate.toLocaleDateString("en-GB")}`, {
    x: right - 150,
    y,
    size: 10,
    font,
    color: TEXT,
  });
  y -= 15;
  page.drawText(`Due: ${dueDate.toLocaleDateString("en-GB")}`, {
    x: right - 150,
    y,
    size: 10,
    font,
    color: TEXT,
  });

  const headerTopY = 802;
  let textY = headerTopY;
  if (logo && wantLogo) {
    const maxW = 140;
    const maxH = 48;
    const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    page.drawImage(logo, {
      x: margin,
      y: headerTopY - lh + 4,
      width: lw,
      height: lh,
    });
    textY = headerTopY - lh - 10;
  }
  if (wantName) {
    page.drawText(companyName, {
      x: margin,
      y: textY,
      size: 18,
      font: bold,
      color: NAVY,
    });
    textY -= 22;
  }
  for (const l of fromLines.slice(0, 6)) {
    page.drawText(l, { x: margin, y: textY, size: 10, font, color: TEXT });
    textY -= 14;
  }

  y = 684;
  page.drawText("Bill To", { x: margin, y, size: 12, font: bold, color: NAVY });
  let by = y - 18;
  for (const l of billingTo.slice(0, 6)) {
    page.drawText(l, { x: margin, y: by, size: 10, font, color: TEXT });
    by -= 14;
  }

  const siteX = 320;
  page.drawText("Site", { x: siteX, y, size: 12, font: bold, color: NAVY });
  let sy = y - 18;
  for (const l of siteTo.slice(0, 6)) {
    page.drawText(l, { x: siteX, y: sy, size: 10, font, color: TEXT });
    sy -= 14;
  }

  const tableY = 572;
  const headerH = 30;
  const rowMinH = 28;
  const itemMaxW = 300;
  page.drawRectangle({ x: margin, y: tableY - headerH, width: right - margin, height: headerH, color: NAVY });
  page.drawText("Item", {
    x: margin + 10,
    y: tableY - 18,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });
  drawRight({ page, font: bold, text: "Qty", rightX: 394, y: tableY - 18, size: 10, color: rgb(1, 1, 1) });
  drawRight({
    page,
    font: bold,
    text: "Unit Price",
    rightX: 470,
    y: tableY - 18,
    size: 10,
    color: rgb(1, 1, 1),
  });
  drawRight({
    page,
    font: bold,
    text: "Line Total",
    rightX: right - 10,
    y: tableY - 18,
    size: 10,
    color: rgb(1, 1, 1),
  });
  let rowY = tableY - headerH - 12;

  const rows =
    (materials ?? []).length > 0
      ? (materials ?? [])
      : [
          {
            description: job.title || "Job works",
            quantity: 1,
            unit_price: Number(job.total_inc_vat ?? 0),
            total_price: Number(job.total_inc_vat ?? 0),
          },
        ];
  for (const r of rows.slice(0, 16)) {
    const itemLines = wrapText(String(r.description || "Item"), font, 10, itemMaxW);
    const lineHeight = 11;
    const rowH = Math.max(rowMinH, itemLines.length * lineHeight + 10);

    page.drawRectangle({
      x: margin,
      y: rowY - rowH,
      width: right - margin,
      height: rowH,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.86, 0.88, 0.9),
      borderWidth: 0.8,
    });
    const textTop = rowY - 14;
    itemLines.forEach((line, idx) => {
      page.drawText(line, {
        x: margin + 10,
        y: textTop - idx * lineHeight,
        size: 10,
        font,
        color: TEXT,
        maxWidth: itemMaxW,
      });
    });
    drawRight({
      page,
      font,
      text: String(r.quantity ?? 0),
      rightX: 394,
      y: textTop,
      size: 10,
      color: TEXT,
    });
    drawRight({
      page,
      font,
      text: money(Number(r.unit_price ?? 0), currency),
      rightX: 470,
      y: textTop,
      size: 10,
      color: TEXT,
    });
    drawRight({
      page,
      font,
      text: money(Number(r.total_price ?? 0), currency),
      rightX: right - 10,
      y: textTop,
      size: 10,
      color: TEXT,
    });
    rowY -= rowH;
  }

  const subtotal = Number(job.subtotal ?? 0);
  const vatAmount = Number(job.vat_amount ?? 0);
  const total = Number(job.total_inc_vat ?? subtotal + vatAmount);
  y = rowY - 18;
  drawRight({
    page,
    font,
    text: `Subtotal: ${money(subtotal, currency)}`,
    rightX: right - 10,
    y,
    size: 12,
    color: TEXT,
  });
  y -= 18;
  drawRight({
    page,
    font,
    text: `VAT: ${money(vatAmount, currency)}`,
    rightX: right - 10,
    y,
    size: 12,
    color: TEXT,
  });
  y -= 22;
  drawRight({
    page,
    font: bold,
    text: `Total: ${money(total, currency)}`,
    rightX: right - 10,
    y,
    size: 15,
    color: NAVY,
  });

  const footerLines = wrapText(invoiceFooterText, font, 9, right - margin);
  if (footerLines.length > 0) {
    const footerStartY = Math.max(44, y - 30);
    footerLines.forEach((line: string, idx: number) => {
      page.drawText(line, {
        x: margin,
        y: footerStartY - idx * 11,
        size: 9,
        font,
        color: TEXT,
      });
    });
  }

  const bytes = await pdf.save();
  return { buffer: Buffer.from(bytes), fileName };
}
