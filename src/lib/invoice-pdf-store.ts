import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { resolveBrandingFromSettings } from "@/lib/branding-settings";
import { fetchLogoBytes } from "@/lib/fetch-logo-bytes";
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

  const billTo = [
    client?.company_name || client?.contact_name || "",
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
  for (const l of billTo.slice(0, 6)) {
    page.drawText(l, { x: margin, y: by, size: 10, font, color: TEXT });
    by -= 14;
  }

  y = 572;
  page.drawRectangle({ x: margin, y: y - 24, width: right - margin, height: 24, color: NAVY });
  page.drawText("Item", {
    x: margin + 10,
    y: y - 16,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });
  drawRight({ page, font: bold, text: "Qty", rightX: 394, y: y - 16, size: 10, color: rgb(1, 1, 1) });
  drawRight({
    page,
    font: bold,
    text: "Unit Price",
    rightX: 470,
    y: y - 16,
    size: 10,
    color: rgb(1, 1, 1),
  });
  drawRight({
    page,
    font: bold,
    text: "Line Total",
    rightX: right - 10,
    y: y - 16,
    size: 10,
    color: rgb(1, 1, 1),
  });
  y -= 30;

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
    page.drawText(String(r.description || "Item"), {
      x: margin + 10,
      y,
      size: 10,
      font,
      color: TEXT,
      maxWidth: 300,
    });
    drawRight({
      page,
      font,
      text: String(r.quantity ?? 0),
      rightX: 394,
      y,
      size: 10,
      color: TEXT,
    });
    drawRight({
      page,
      font,
      text: money(Number(r.unit_price ?? 0), currency),
      rightX: 470,
      y,
      size: 10,
      color: TEXT,
    });
    drawRight({
      page,
      font,
      text: money(Number(r.total_price ?? 0), currency),
      rightX: right - 10,
      y,
      size: 10,
      color: TEXT,
    });
    y -= 18;
  }

  const subtotal = Number(job.subtotal ?? 0);
  const vatAmount = Number(job.vat_amount ?? 0);
  const total = Number(job.total_inc_vat ?? subtotal + vatAmount);
  y -= 22;
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

  const bytes = await pdf.save();
  return { buffer: Buffer.from(bytes), fileName };
}
