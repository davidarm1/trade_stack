import { NextResponse } from "next/server";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import {
  getSessionTenantOrError,
  rejectForeignTenantId,
} from "@/lib/api-auth";
import { uploadToB2 } from "@/lib/b2";
import { resolveBrandingFromSettings } from "@/lib/branding-settings";
import { fetchLogoBytes } from "@/lib/fetch-logo-bytes";
import { formatJobRefFormal } from "@/lib/job-number";
import type { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Colour palette (mirrors invoice-pdf) ────────────────────────────────────
const NAVY       = rgb(26 / 255, 46 / 255, 74 / 255);   // #1a2e4a
const ORANGE     = rgb(232 / 255, 118 / 255, 61 / 255);  // #E8763D
const LIGHT_GREY = rgb(245 / 255, 246 / 255, 248 / 255);
const BORDER     = rgb(220 / 255, 224 / 255, 230 / 255);
const TEXT       = rgb(30 / 255, 41 / 255, 59 / 255);
const WHITE      = rgb(1, 1, 1);

function str(value: unknown, fallback = "—"): string {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function opt(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

function wrapText(value: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const raw = value.trim();
  if (!raw) return ["—"];
  const lines: string[] = [];
  for (const paragraph of raw.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
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

type PdfImageResult = { image: PDFImage; label: string };

async function embedRemoteImage(
  pdf: PDFDocument,
  url: string | null | undefined,
  label: string,
): Promise<PdfImageResult | null> {
  const src = String(url ?? "").trim();
  if (!src) return null;
  try {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
    const lower = src.toLowerCase();
    const image =
      ct.includes("png") || lower.includes(".png")
        ? await pdf.embedPng(bytes)
        : ct.includes("jpeg") || ct.includes("jpg") || lower.includes(".jpg") || lower.includes(".jpeg")
          ? await pdf.embedJpg(bytes)
          : null;
    return image ? { image, label } : null;
  } catch {
    return null;
  }
}

async function buildJobSheetPdf(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobId: string;
}): Promise<{ buffer: Buffer; fileName: string }> {
  const { supabase, tenantId, jobId } = args;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobErr || !job) throw new Error(jobErr?.message ?? "Job not found");

  const [
    { data: tenant },
    { data: settingRows },
    { data: client },
    { data: materials },
    { data: engineer },
    { data: completion },
    { data: images },
  ] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    supabase.from("settings").select("field_key, field_value").eq("tenant_id", tenantId),
    job.client_id
      ? supabase.from("clients").select("*").eq("id", job.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("job_materials")
      .select("*")
      .eq("job_id", jobId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true }),
    job.assigned_engineer_id
      ? supabase.from("users").select("name").eq("id", job.assigned_engineer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("job_completions").select("*").eq("job_id", jobId).eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("job_images")
      .select("image_url, image_name")
      .eq("job_id", jobId)
      .eq("tenant_id", tenantId)
      .order("uploaded_at", { ascending: true }),
  ]);

  // ── Settings resolution ──────────────────────────────────────────────────
  const settings = Object.fromEntries(
    (settingRows ?? []).map((r) => [String(r.field_key), String(r.field_value ?? "")]),
  );
  const companyName = opt(settings.company_name) ?? opt(tenant?.name);
  const companyPhone = opt(settings.phone) ?? opt(tenant?.phone);
  const companyEmail = opt(settings.email) ?? opt(tenant?.email);
  const companyAddressLines = [
    settings.address_line_1 || tenant?.address1,
    settings.address_line_2 || tenant?.address2,
    settings.town || tenant?.town,
    settings.postcode || tenant?.postcode,
  ].map((p) => String(p ?? "").trim()).filter(Boolean);
  const companyDetailLines = [
    ...companyAddressLines,
    companyPhone ? `Tel: ${companyPhone}` : "",
    companyEmail ? `Email: ${companyEmail}` : "",
  ].filter(Boolean);

  // ── PDF document + fonts ─────────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // ── Logo ─────────────────────────────────────────────────────────────────
  const { showLogo: wantLogo, showName: wantName } = resolveBrandingFromSettings(settings);
  const logoUrl = String(tenant?.logo_url ?? "").trim() || null;
  const { bytes: logoBytes, mime: logoMime } =
    wantLogo && logoUrl ? await fetchLogoBytes(logoUrl) : { bytes: null, mime: "" };
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (logoBytes) {
    try {
      const lowerUrl = String(logoUrl ?? "").toLowerCase();
      if (logoMime.includes("png") || lowerUrl.includes(".png")) {
        logo = await pdf.embedPng(logoBytes);
      } else if (
        logoMime.includes("jpeg") || logoMime.includes("jpg") ||
        lowerUrl.includes(".jpg") || lowerUrl.includes(".jpeg")
      ) {
        logo = await pdf.embedJpg(logoBytes);
      }
    } catch {
      logo = null;
    }
  }

  // ── Layout constants ─────────────────────────────────────────────────────
  const PAGE_W   = 595.28;
  const PAGE_H   = 841.89;
  const MARGIN   = 42;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const MID      = PAGE_W / 2;
  const FOOTER_H = 28; // reserved at bottom of every page

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function addPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function ensureSpace(required: number) {
    if (y - required < MARGIN + FOOTER_H) addPage();
  }

  function rule(thickness = 0.75) {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness,
      color: BORDER,
    });
  }

  function drawContainedImage(image: PDFImage, x: number, topY: number, maxW: number, maxH: number) {
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const iw = image.width * scale;
    const ih = image.height * scale;
    page.drawImage(image, { x: x + (maxW - iw) / 2, y: topY - ih, width: iw, height: ih });
  }

  // ── Job reference ─────────────────────────────────────────────────────────
  const jobRef =
    formatJobRefFormal(job.job_number as number | null | undefined) ||
    `JOB-${String(job.id).slice(0, 8)}`;

  // ── HEADER ────────────────────────────────────────────────────────────────
  let headerTextY = y - 10;

  if (logo && wantLogo) {
    const maxW = 120;
    const maxH = 52;
    const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    page.drawImage(logo, { x: MARGIN, y: y - lh + 6, width: lw, height: lh });
    headerTextY = y - lh - 12;
  }
  if (companyName && wantName) {
    page.drawText(companyName, { x: MARGIN, y: headerTextY, size: 15, font: bold, color: ORANGE });
    headerTextY -= 18;
  }
  for (const line of companyDetailLines.slice(0, 5)) {
    page.drawText(line, { x: MARGIN, y: headerTextY, size: 8.5, font, color: TEXT });
    headerTextY -= 11;
  }

  // Right block: title + job ref
  page.drawText("JOB SHEET", {
    x: PAGE_W - MARGIN - 145,
    y: y - 10,
    size: 22,
    font: bold,
    color: NAVY,
  });
  page.drawText(jobRef, {
    x: PAGE_W - MARGIN - 145,
    y: y - 38,
    size: 13,
    font: bold,
    color: NAVY,
  });

  y = Math.min(headerTextY, y - 62) - 12;
  rule();
  y -= 18;

  // ── CLIENT / JOB DETAILS ─────────────────────────────────────────────────
  const rightColX = MID + 10;

  page.drawText("CLIENT", { x: MARGIN, y, size: 11, font: bold, color: NAVY });
  page.drawText("JOB DETAILS", { x: rightColX, y, size: 11, font: bold, color: NAVY });
  y -= 15;

  // Left: client name + site address
  const clientName = opt(client?.company_name ?? client?.contact_name) ?? "—";
  let leftY = y;
  page.drawText(clientName, { x: MARGIN, y: leftY, size: 10, font: bold, color: TEXT });
  leftY -= 13;

  const siteLines = [
    job.site_address1 ?? client?.site_address1 ?? client?.address1,
    job.site_address2 ?? client?.site_address2 ?? client?.address2,
    job.site_town ?? client?.site_town ?? client?.town,
    job.site_postcode ?? client?.site_postcode ?? client?.postcode,
  ].map((p) => String(p ?? "").trim()).filter(Boolean);
  for (const line of siteLines.slice(0, 4)) {
    page.drawText(line, { x: MARGIN, y: leftY, size: 9, font, color: TEXT });
    leftY -= 11;
  }
  if (client?.contact_name && client.contact_name !== (client?.company_name ?? "")) {
    page.drawText(`Contact: ${client.contact_name}`, { x: MARGIN, y: leftY, size: 9, font, color: TEXT });
    leftY -= 11;
  }
  if (client?.contact_number) {
    page.drawText(`Tel: ${client.contact_number}`, { x: MARGIN, y: leftY, size: 9, font, color: TEXT });
    leftY -= 11;
  }

  // Right: job meta rows
  const metaValueX = rightColX + 84;
  let rightY = y;
  const metaRows: [string, string | null][] = [
    ["Date on site:", opt(job.date_onsite)],
    ["Time:", opt(job.time_onsite)],
    ["Engineer:", opt(engineer?.name)],
    ["Status:", opt(job.status)],
    ["PO / Order No:", opt(job.client_order_number ?? job.custom_po_number)],
  ];
  for (const [label, value] of metaRows) {
    if (!value) continue;
    page.drawText(label, { x: rightColX, y: rightY, size: 9, font: bold, color: NAVY });
    page.drawText(value, { x: metaValueX, y: rightY, size: 9, font, color: TEXT });
    rightY -= 13;
  }

  y = Math.min(leftY, rightY) - 14;
  rule();
  y -= 16;

  // ── Section helper ────────────────────────────────────────────────────────
  function drawSection(heading: string, body: string) {
    ensureSpace(42);
    page.drawText(heading, { x: MARGIN, y, size: 9, font: bold, color: NAVY });
    y -= 11;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: BORDER,
    });
    y -= 11;
    const lines = wrapText(body, CONTENT_W, font, 9);
    for (const line of lines) {
      ensureSpace(14);
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: TEXT });
      y -= 12;
    }
    y -= 10;
  }

  // ── Content sections ──────────────────────────────────────────────────────
  const jobDescription = opt(job.description);
  if (jobDescription) drawSection("JOB DESCRIPTION", jobDescription);

  drawSection(
    "WORK CARRIED OUT",
    opt(completion?.work_carried_out) ?? "No completion notes recorded.",
  );

  const partsUsed = opt((completion as { parts_used?: string | null } | null)?.parts_used);
  if (partsUsed) drawSection("PARTS USED", partsUsed);

  const recommendations = opt((completion as { recommendations?: string | null } | null)?.recommendations);
  if (recommendations) drawSection("RECOMMENDATIONS", recommendations);

  // ── Materials & labour table ──────────────────────────────────────────────
  ensureSpace(80);
  page.drawText("MATERIALS & LABOUR", { x: MARGIN, y, size: 9, font: bold, color: NAVY });
  y -= 11;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: BORDER });
  y -= 2;

  const TABLE_X   = MARGIN;
  const TABLE_W   = CONTENT_W;
  const HEADER_H  = 20;
  const ROW_H     = 20;
  const itemLeft  = TABLE_X + 6;
  const itemMaxW  = 250;
  const qtyRight  = TABLE_X + 340;
  const unitRight = TABLE_X + 430;
  const lineRight = TABLE_X + TABLE_W - 6;

  // Navy header band
  page.drawRectangle({ x: TABLE_X, y: y - HEADER_H, width: TABLE_W, height: HEADER_H, color: NAVY });
  page.drawText("Description", { x: itemLeft, y: y - 13, size: 8.5, font: bold, color: WHITE });
  drawRightText({ text: "Qty",        rightX: qtyRight,  y: y - 13, size: 8.5, font: bold, color: WHITE, page });
  drawRightText({ text: "Unit Price", rightX: unitRight, y: y - 13, size: 8.5, font: bold, color: WHITE, page });
  drawRightText({ text: "Line Total", rightX: lineRight, y: y - 13, size: 8.5, font: bold, color: WHITE, page });
  y -= HEADER_H;

  const matRows = (materials ?? []).length
    ? (materials ?? [])
    : [{ description: "No materials recorded", quantity: null, unit_price: null, total_price: null }];

  matRows.forEach((row, idx) => {
    ensureSpace(ROW_H + 4);
    if (idx % 2 === 1) {
      page.drawRectangle({ x: TABLE_X, y: y - ROW_H, width: TABLE_W, height: ROW_H, color: LIGHT_GREY });
    }
    page.drawRectangle({ x: TABLE_X, y: y - ROW_H, width: TABLE_W, height: ROW_H, borderColor: BORDER, borderWidth: 0.5 });
    const d     = String(row.description ?? "").slice(0, 72) || "—";
    const qty   = row.quantity   != null ? String(row.quantity)   : "";
    const unit  = row.unit_price != null ? String(row.unit_price) : "";
    const total = row.total_price != null ? String(row.total_price) : "";
    page.drawText(d, { x: itemLeft, y: y - 13, size: 8.5, font, color: TEXT, maxWidth: itemMaxW });
    if (qty)   drawRightText({ text: qty,   rightX: qtyRight,  y: y - 13, size: 8.5, font, color: TEXT, page });
    if (unit)  drawRightText({ text: unit,  rightX: unitRight, y: y - 13, size: 8.5, font, color: TEXT, page });
    if (total) drawRightText({ text: total, rightX: lineRight, y: y - 13, size: 8.5, font, color: TEXT, page });
    y -= ROW_H;
  });

  // Totals row below table
  y -= 10;
  const labourStr   = job.labour_charge   != null ? `Labour: ${String(job.labour_charge)}`        : null;
  const materialsStr = job.total_materials != null ? `Materials: ${String(job.total_materials)}` : null;
  const totalsLine  = [labourStr, materialsStr].filter(Boolean).join("   ");
  if (totalsLine) {
    page.drawText(totalsLine, { x: MARGIN, y, size: 9, font: bold, color: NAVY });
    y -= 8;
  }
  y -= 14;

  // ── Signature ─────────────────────────────────────────────────────────────
  ensureSpace(130);
  rule();
  y -= 16;

  page.drawText("CLIENT SIGNATURE", { x: MARGIN, y, size: 9, font: bold, color: NAVY });
  y -= 11;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: BORDER });
  y -= 14;

  const printName = opt((completion as { client_print_name?: string | null } | null)?.client_print_name);
  if (printName) {
    page.drawText(`Name: ${printName}`, { x: MARGIN, y, size: 9.5, font, color: TEXT });
    y -= 14;
  }

  // Start/finish time if present
  const startTime  = opt((completion as { start_time?: string | null } | null)?.start_time);
  const finishTime = opt((completion as { finish_time?: string | null } | null)?.finish_time);
  if (startTime || finishTime) {
    const timeLine = [
      startTime  ? `Start: ${startTime}`  : null,
      finishTime ? `Finish: ${finishTime}` : null,
    ].filter(Boolean).join("   ");
    page.drawText(timeLine, { x: MARGIN, y, size: 9, font, color: TEXT });
    y -= 14;
  }

  const sigH = 80;
  page.drawRectangle({
    x: MARGIN,
    y: y - sigH,
    width: CONTENT_W,
    height: sigH,
    borderColor: BORDER,
    borderWidth: 1.5,
  });

  const signature = await embedRemoteImage(
    pdf,
    job.signature_url ?? (completion as { client_signature_url?: string | null } | null)?.client_signature_url,
    "Signature",
  );
  if (signature) {
    drawContainedImage(signature.image, MARGIN + 8, y - 6, CONTENT_W - 16, sigH - 12);
  }
  y -= sigH + 10;

  const signedAt = opt(job.signed_at ?? (completion as { submitted_at?: string | null } | null)?.submitted_at);
  if (signedAt) {
    const signedDate = new Date(signedAt).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    page.drawText(`Signed: ${signedDate}`, { x: MARGIN, y, size: 8.5, font, color: TEXT });
  }

  // ── Photos — always start on a new page ───────────────────────────────────
  const photoImages = (
    await Promise.all(
      (images ?? []).map((img) =>
        embedRemoteImage(pdf, img.image_url, str(img.image_name, "Photo")),
      ),
    )
  ).filter(Boolean) as PdfImageResult[];

  if (photoImages.length > 0) {
    addPage();
    page.drawText("ENGINEER WORK PHOTOS", { x: MARGIN, y, size: 9, font: bold, color: NAVY });
    y -= 11;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: BORDER });
    y -= 20;

    const gap    = 14;
    const photoW = (CONTENT_W - gap) / 2;
    const photoH = 160;

    for (let i = 0; i < photoImages.length; i += 2) {
      ensureSpace(photoH + 30);
      const row = photoImages.slice(i, i + 2);
      row.forEach((photo, idx) => {
        const x = MARGIN + idx * (photoW + gap);
        page.drawRectangle({ x, y: y - photoH, width: photoW, height: photoH, borderColor: BORDER, borderWidth: 1 });
        drawContainedImage(photo.image, x + 4, y - 4, photoW - 8, photoH - 26);
        page.drawText(photo.label.slice(0, 44), {
          x: x + 4,
          y: y - photoH + 8,
          size: 8,
          font,
          color: TEXT,
        });
      });
      y -= photoH + 14;
    }
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = pdf.getPageCount();
  const genDate = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < pageCount; i++) {
    const pg = pdf.getPage(i);
    const footerY = MARGIN - 2;
    pg.drawLine({
      start: { x: MARGIN, y: footerY + 16 },
      end: { x: PAGE_W - MARGIN, y: footerY + 16 },
      thickness: 0.5,
      color: BORDER,
    });
    pg.drawText(`${jobRef} · Generated ${genDate} · Page ${i + 1} of ${pageCount}`, {
      x: MARGIN,
      y: footerY,
      size: 7.5,
      font,
      color: TEXT,
    });
  }

  const bytes = await pdf.save();
  return {
    buffer: Buffer.from(bytes),
    fileName: `${jobRef.replace(/[^\w-]+/g, "_")}_jobsheet.pdf`,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getSessionTenantOrError();
    if (!session.ok) return session.response;
    const { jobId } = await context.params;
    const { buffer, fileName } = await buildJobSheetPdf({
      supabase: session.supabase,
      tenantId: session.tenantId,
      jobId,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate job sheet" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;

  let bodyTenantId: string | undefined;
  try {
    const body = (await request.json()) as { tenantId?: string; jobId?: string };
    bodyTenantId = body.tenantId;
  } catch {
    bodyTenantId = undefined;
  }
  const mismatch = rejectForeignTenantId(bodyTenantId, session.tenantId);
  if (mismatch) return mismatch;

  const { jobId } = await context.params;
  const { supabase, tenantId } = session;

  let generated: { buffer: Buffer; fileName: string };
  try {
    generated = await buildJobSheetPdf({ supabase, tenantId, jobId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate job sheet" },
      { status: 500 },
    );
  }

  const { buffer, fileName } = generated;
  const key = `tradestack/${tenantId}/jobsheets/${jobId}.pdf`;
  const url = await uploadToB2(buffer, key, "application/pdf");

  const { error: fileErr } = await supabase.from("tenant_files").insert({
    tenant_id: tenantId,
    job_id: jobId,
    file_type: "jobsheet",
    b2_key: key,
    file_name: fileName,
    file_size_bytes: buffer.length,
    public_url: url,
  });

  if (fileErr) return NextResponse.json({ error: fileErr.message }, { status: 500 });

  const { error: updErr } = await supabase
    .from("jobs")
    .update({ jobsheet_url: url, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("tenant_id", tenantId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ success: true, url });
}
