import { NextResponse } from "next/server";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { resolveBrandingFromSettings } from "@/lib/branding-settings";
import { fetchLogoBytes } from "@/lib/fetch-logo-bytes";
import { formatJobRefFormal } from "@/lib/job-number";
import { compactTemplateBlock, multilineTemplateBlock, renderTemplateText } from "@/lib/text-template";

export const runtime = "nodejs";

const NAVY = rgb(26 / 255, 46 / 255, 74 / 255); // #1a2e4a
const ORANGE = rgb(232 / 255, 118 / 255, 61 / 255); // #E8763D
const LIGHT_GREY = rgb(245 / 255, 246 / 255, 248 / 255);
const BORDER = rgb(220 / 255, 224 / 255, 230 / 255);
const TEXT = rgb(30 / 255, 41 / 255, 59 / 255);

function asMoney(amount: unknown, currencyCode: string): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return asMoney(0, currencyCode);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

function text(v: unknown): string {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : "—";
}

function optionalText(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function wrapText(
  value: string,
  maxWidth: number,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  size: number,
): string[] {
  const raw = value.trim();
  if (!raw) return ["—"];
  const words = raw.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["—"];
}

function drawRightText(args: {
  text: string;
  rightX: number;
  y: number;
  size: number;
  font: PDFFont;
  color: ReturnType<typeof rgb>;
  page: PDFPage;
}) {
  const { text, rightX, y, size, font, color, page } = args;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;

  const { jobId } = await context.params;
  const { supabase, tenantId } = session;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message ?? "Job not found" },
      { status: 404 },
    );
  }

  const [{ data: tenant }, { data: settingRows }, { data: client }, { data: materials }] =
    await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase
        .from("settings")
        .select("field_key, field_value")
        .eq("tenant_id", tenantId),
      job.client_id
        ? supabase.from("clients").select("*").eq("id", job.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("job_materials")
        .select("*")
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true }),
    ]);

  const settings = Object.fromEntries(
    (settingRows ?? []).map((r) => [String(r.field_key), String(r.field_value ?? "")]),
  );
  const currencyCode = String(tenant?.currency ?? "GBP").toUpperCase();
  const companyName = optionalText(settings.company_name) ?? optionalText(tenant?.name);
  const companyPhone =
    optionalText(settings.phone) ??
    optionalText(settings.company_phone) ??
    optionalText(tenant?.phone);
  const companyEmail =
    optionalText(settings.email) ??
    optionalText(settings.company_email) ??
    optionalText(tenant?.email);
  const bankLines = [
    tenant?.bank_account_name ? `Account name: ${tenant.bank_account_name}` : null,
    tenant?.bank_name ? `Bank: ${tenant.bank_name}` : null,
    tenant?.bank_sort_code ? `Sort code: ${tenant.bank_sort_code}` : null,
    tenant?.bank_account_number ? `Account number: ${tenant.bank_account_number}` : null,
    tenant?.bank_iban ? `IBAN: ${tenant.bank_iban}` : null,
    tenant?.bank_swift ? `SWIFT/BIC: ${tenant.bank_swift}` : null,
  ].filter(Boolean) as string[];
  const companyAddressLines = [
    settings.address_line_1 || settings.company_address1 || tenant?.address1,
    settings.address_line_2 || settings.company_address2 || tenant?.address2,
    settings.town || settings.company_town || tenant?.town,
    settings.postcode || settings.company_postcode || tenant?.postcode,
  ]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  const footerTemplate = String(tenant?.invoice_footer_text ?? "").trim();
  const vatRegistered = Boolean(String(tenant?.vat_number ?? "").trim());
  const footerValues = {
    company_name: companyName ?? "",
    address: compactTemplateBlock(companyAddressLines),
    address_block: multilineTemplateBlock(companyAddressLines),
    email: companyEmail ?? "",
    phone: companyPhone ?? "",
    company_no: String(tenant?.company_reg_number ?? "").trim(),
    vat_no: String(tenant?.vat_number ?? "").trim(),
    bank_name: String(tenant?.bank_name ?? "").trim(),
    bank_account_name: String(tenant?.bank_account_name ?? "").trim(),
    bank_account_number: String(tenant?.bank_account_number ?? "").trim(),
    bank_sort_code: String(tenant?.bank_sort_code ?? "").trim(),
    bank_iban: String(tenant?.bank_iban ?? "").trim(),
    bank_swift: String(tenant?.bank_swift ?? "").trim(),
    bank_details: multilineTemplateBlock(bankLines),
    bank_details_inline: compactTemplateBlock(bankLines),
  };
  const invoiceFooterText =
    renderTemplateText(footerTemplate, footerValues).trim() || "Thank you for your business.";
  const footerUsesBankDetails = /##(?:bank_[a-z0-9_]+|bank_details)##|\{\{(?:bank_[a-z0-9_]+|bank_details)\}\}/i.test(footerTemplate);

  const clientName = text(client?.company_name ?? client?.contact_name);
  const billingAddressLines = [
    client?.address1,
    client?.address2,
    client?.town,
    client?.postcode,
  ]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  const siteAddressLines = [
    job.site_address1 ?? client?.site_address1 ?? client?.address1,
    job.site_address2 ?? client?.site_address2 ?? client?.address2,
    job.site_town ?? client?.site_town ?? client?.town,
    job.site_postcode ?? client?.site_postcode ?? client?.postcode,
  ]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);

  const invoiceDate = new Date();
  const termsDays = toNumber(job.payment_terms_days ?? tenant?.default_payment_terms_days, 30);
  const dueDate = new Date(invoiceDate.getTime() + termsDays * 24 * 60 * 60 * 1000);
  const jobRef =
    formatJobRefFormal(job.job_number as number | null | undefined) ||
    `JOB-${String(job.id).slice(0, 8)}`;
  const invoiceNumber = text(job.custom_invoice_number ?? `${jobRef}-INV`);
  const vatRate = vatRegistered ? toNumber(job.vat_rate ?? settings.default_vat_rate, 0) : 0;

  const subtotal = toNumber(job.subtotal, 0);
  const vatAmount = toNumber(job.vat_amount, 0);
  const total = vatRegistered ? toNumber(job.total_inc_vat, subtotal + vatAmount) : subtotal;

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 42;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { showLogo: wantLogo, showName: wantName } = resolveBrandingFromSettings(settings);
  const logoUrl =
    String(tenant?.logo_url ?? "").trim() ||
    String(settings.logo_url ?? "").trim() ||
    null;
  const { bytes: logoBytes, mime: logoMime } =
    wantLogo && logoUrl
      ? await fetchLogoBytes(logoUrl)
      : { bytes: null, mime: "" };
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (logoBytes) {
    try {
      if (
        logoMime.includes("png") ||
        String(logoUrl ?? "")
          .toLowerCase()
          .includes(".png")
      ) {
        logo = await pdf.embedPng(logoBytes);
      } else if (
        logoMime.includes("jpeg") ||
        logoMime.includes("jpg") ||
        String(logoUrl ?? "")
          .toLowerCase()
          .includes(".jpg") ||
        String(logoUrl ?? "")
          .toLowerCase()
          .includes(".jpeg")
      ) {
        logo = await pdf.embedJpg(logoBytes);
      }
    } catch {
      logo = null;
    }
  }
  let y = height - margin;

  // HEADER (left: logo *or* company name, then address block)
  const companyDetailLines = [
    ...companyAddressLines,
    companyPhone ? `Tel: ${companyPhone}` : "",
    companyEmail ? `Email: ${companyEmail}` : "",
  ].filter(Boolean);

  let headerTextY = y - 10;
  if (logo && wantLogo) {
    const maxW = 120;
    const maxH = 52;
    const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, {
      x: margin,
      y: y - h + 6,
      width: w,
      height: h,
    });
    headerTextY = y - h - 12;
  }
  if (companyName && wantName) {
    page.drawText(companyName, {
      x: margin,
      y: headerTextY,
      size: 16,
      font: bold,
      color: ORANGE,
    });
    headerTextY -= 20;
  }
  for (const line of companyDetailLines.slice(0, 5)) {
    page.drawText(line, { x: margin, y: headerTextY, size: 9, font, color: TEXT });
    headerTextY -= 11;
  }

  page.drawText("INVOICE", {
    x: width - margin - 138,
    y: y - 10,
    size: 26,
    font: bold,
    color: NAVY,
  });
  const metaX = width - margin - 170;
  let metaY = y - 42;
  for (const [label, value] of [
    ["Invoice Number", invoiceNumber],
    ["Invoice Date", invoiceDate.toLocaleDateString("en-GB")],
    ["Due Date", dueDate.toLocaleDateString("en-GB")],
    ["Job Reference", jobRef],
  ] as const) {
    page.drawText(`${label}:`, { x: metaX, y: metaY, size: 9, font: bold, color: NAVY });
    page.drawText(value, { x: metaX + 82, y: metaY, size: 9, font, color: TEXT });
    metaY -= 12;
  }

  y -= 86;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: BORDER,
  });
  y -= 20;

  // BILL TO / SITE SECTION
  const sectionTop = y;
  const boxGap = 12;
  const boxWidth = (width - margin * 2 - boxGap) / 2;
  const boxHeight = 18 + Math.max(billingAddressLines.length + 1, siteAddressLines.length + 1) * 11 + 10;
  const boxFill = rgb(0.97, 0.98, 0.99);
  const leftBoxX = margin;
  const rightBoxX = margin + boxWidth + boxGap;

  page.drawRectangle({
    x: leftBoxX,
    y: sectionTop - boxHeight,
    width: boxWidth,
    height: boxHeight,
    color: boxFill,
    borderColor: BORDER,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: rightBoxX,
    y: sectionTop - boxHeight,
    width: boxWidth,
    height: boxHeight,
    color: boxFill,
    borderColor: BORDER,
    borderWidth: 1,
  });

  page.drawText("Bill To", { x: leftBoxX + 8, y: sectionTop - 14, size: 11, font: bold, color: NAVY });
  page.drawText("Site", { x: rightBoxX + 8, y: sectionTop - 14, size: 11, font: bold, color: NAVY });

  let leftY = sectionTop - 28;
  page.drawText(clientName, { x: leftBoxX + 8, y: leftY, size: 10, font: bold, color: TEXT });
  leftY -= 11;
  for (const line of billingAddressLines.slice(0, 4)) {
    page.drawText(line, { x: leftBoxX + 8, y: leftY, size: 9, font, color: TEXT });
    leftY -= 11;
  }

  let siteLineY = sectionTop - 28;
  for (const line of siteAddressLines.slice(0, 4)) {
    page.drawText(line, { x: rightBoxX + 8, y: siteLineY, size: 9, font, color: TEXT });
    siteLineY -= 11;
  }

  y = sectionTop - boxHeight - 22;

  // LINE ITEMS TABLE
  const tableX = margin;
  const tableW = width - margin * 2;
  const headerH = 26;
  const rowMinH = 28;
  const bottomReserve = 170;
  const itemLeft = tableX + 8;
  const itemMaxW = 260;
  const qtyRight = tableX + 350;
  const unitRight = tableX + 430;
  const lineRight = tableX + tableW - 10;

  function drawTableHeader() {
    page.drawRectangle({
      x: tableX,
      y: y - headerH,
      width: tableW,
      height: headerH,
      color: NAVY,
    });
    page.drawText("Item", { x: itemLeft, y: y - 14, size: 9, font: bold, color: rgb(1, 1, 1) });
    drawRightText({
      text: "Qty",
      rightX: qtyRight,
      y: y - 14,
      size: 9,
      font: bold,
      color: rgb(1, 1, 1),
      page,
    });
    drawRightText({
      text: "Unit Price",
      rightX: unitRight,
      y: y - 14,
      size: 9,
      font: bold,
      color: rgb(1, 1, 1),
      page,
    });
    drawRightText({
      text: "Line Total",
      rightX: lineRight,
      y: y - 14,
      size: 9,
      font: bold,
      color: rgb(1, 1, 1),
      page,
    });
    y -= headerH + 10;
  }

  function addContinuationPage() {
    page = pdf.addPage([width, height]);
    y = height - margin;
    drawTableHeader();
  }

  drawTableHeader();

  const rows = (materials ?? []).length
    ? (materials ?? [])
    : [
        {
          description: job.description ?? job.title ?? "Job works",
          quantity: 1,
          unit_price: total,
          total_price: total,
        },
      ];

  rows.forEach((row, idx) => {
    const qtyValue = row.quantity != null ? String(row.quantity) : "1";
    const unitValue = asMoney(row.unit_price, currencyCode);
    const lineValue = asMoney(row.total_price, currencyCode);
    const itemLines = wrapText(text(row.description), itemMaxW, font, 9);
    const lineHeight = 10;
    const rowTextHeight = itemLines.length * lineHeight + 12;
    const rowH = Math.max(rowMinH, rowTextHeight);

    if (y - rowH < margin + bottomReserve) {
      addContinuationPage();
    }
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: tableX,
        y: y - rowH,
        width: tableW,
        height: rowH,
        color: LIGHT_GREY,
      });
    }
    page.drawRectangle({
      x: tableX,
      y: y - rowH,
      width: tableW,
      height: rowH,
      borderColor: BORDER,
      borderWidth: 0.5,
    });
    const textTop = y - 14;
    itemLines.forEach((line, lineIdx) => {
      page.drawText(line, {
        x: itemLeft,
        y: textTop - lineIdx * lineHeight,
        size: 9,
        font,
        color: TEXT,
      });
    });
    drawRightText({
      text: qtyValue,
      rightX: qtyRight,
      y: textTop,
      size: 9,
      font,
      color: TEXT,
      page,
    });
    drawRightText({
      text: unitValue,
      rightX: unitRight,
      y: textTop,
      size: 9,
      font,
      color: TEXT,
      page,
    });
    drawRightText({
      text: lineValue,
      rightX: lineRight,
      y: textTop,
      size: 9,
      font,
      color: TEXT,
      page,
    });
    y -= rowH;
  });

  y -= 26;

  // TOTALS SECTION
  const totalsValueRight = width - margin;
  const totalsLabelRight = totalsValueRight - 120;
  const vatLabel = vatRegistered ? `VAT (${vatRate.toFixed(2).replace(/\.00$/, "")}%)` : null;
  const vatNote = vatRegistered ? null : "VAT not charged";
  for (const [label, value, isTotal] of [
    ["Subtotal", asMoney(subtotal, currencyCode), false],
    ...(vatLabel ? ([[vatLabel, asMoney(vatAmount, currencyCode), false] as const]) : []),
    ["Total", asMoney(total, currencyCode), true],
  ] as const) {
    const size = isTotal ? 13 : 10;
    const valueColor = isTotal ? ORANGE : TEXT;
    const labelColor = isTotal ? NAVY : TEXT;
    drawRightText({
      text: label,
      rightX: totalsLabelRight,
      y,
      size,
      font: isTotal ? bold : font,
      color: labelColor,
      page,
    });
    drawRightText({
      text: value,
      rightX: totalsValueRight,
      y,
      size,
      font: isTotal ? bold : font,
      color: valueColor,
      page,
    });
    y -= isTotal ? 18 : 14;
  }
  if (vatNote) {
    page.drawText(vatNote, {
      x: totalsLabelRight - 8,
      y: y + 2,
      size: 8.5,
      font,
      color: TEXT,
    });
  }

  // FOOTER
  const footerY = margin + 18;
  page.drawLine({
    start: { x: margin, y: footerY + 18 },
    end: { x: width - margin, y: footerY + 18 },
    thickness: 1,
    color: BORDER,
  });
  page.drawText(
    `${companyName ? `${companyName} • ` : ""}Payment terms: ${termsDays} days${
      tenant?.vat_number ? ` • VAT No: ${tenant.vat_number}` : ""
    }${vatRegistered ? "" : " • VAT not charged"}`,
    { x: margin, y: footerY + 4, size: 8.5, font, color: TEXT },
  );
  if (!footerUsesBankDetails && bankLines.length > 0) {
    const paymentTop = footerY + 48;
    page.drawText("Payment details", {
      x: margin,
      y: paymentTop,
      size: 10,
      font: bold,
      color: NAVY,
    });
    bankLines.forEach((line, idx) => {
      page.drawText(line, {
        x: margin,
        y: paymentTop - 14 - idx * 12,
        size: 9,
        font,
        color: TEXT,
      });
    });
  }

  const footerLines = invoiceFooterText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (footerLines.length > 0) {
    footerLines.forEach((line, idx) => {
      page.drawText(line, {
        x: margin,
        y: footerY - 8 - idx * 11,
        size: 9,
        font: bold,
        color: NAVY,
      });
    });
  }

  const pdfBytes = await pdf.save();
  const fileName = `${invoiceNumber.replace(/[^\w-]+/g, "_")}.pdf`;
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
