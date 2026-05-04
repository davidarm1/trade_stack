import { NextResponse } from "next/server";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import {
  getSessionTenantOrError,
  rejectForeignTenantId,
} from "@/lib/api-auth";
import { uploadToB2 } from "@/lib/b2";
import { formatJobRefFormal } from "@/lib/job-number";
import type { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type PdfImageResult = {
  image: PDFImage;
  label: string;
};

function siteAddressLines(args: {
  site1: string | null | undefined;
  site2: string | null | undefined;
  town: string | null | undefined;
  postcode: string | null | undefined;
}): string {
  const parts = [
    args.site1,
    args.site2,
    [args.town, args.postcode].filter(Boolean).join(" "),
  ].filter((p) => p && String(p).trim());
  return parts.join("\n") || "—";
}

function text(value: unknown, fallback = "—"): string {
  const s = String(value ?? "").trim();
  return s || fallback;
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
    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    const lowerSrc = src.toLowerCase();
    const image =
      contentType.includes("png") || lowerSrc.includes(".png")
        ? await pdf.embedPng(bytes)
        : contentType.includes("jpeg") ||
            contentType.includes("jpg") ||
            lowerSrc.includes(".jpg") ||
            lowerSrc.includes(".jpeg")
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

  if (jobErr || !job) {
    throw new Error(jobErr?.message ?? "Job not found");
  }

  const [
    { data: tenant },
    { data: client },
    { data: materials },
    { data: engineer },
    { data: completion },
    { data: images },
  ] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
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
        ? supabase
            .from("users")
            .select("name")
            .eq("id", job.assigned_engineer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("job_completions")
        .select("*")
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("job_images")
        .select("image_url, image_name")
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .order("uploaded_at", { ascending: true }),
    ]);

  const company = text(tenant?.name, "Company");
  const clientName =
    client?.company_name ??
    client?.contact_name ??
    "—";

  const site = siteAddressLines({
    site1: job.site_address1 ?? client?.site_address1 ?? client?.address1,
    site2: job.site_address2 ?? client?.site_address2 ?? client?.address2,
    town: job.site_town ?? client?.site_town ?? client?.town,
    postcode: job.site_postcode ?? client?.site_postcode ?? client?.postcode,
  });

  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 48;
  const contentWidth = width - 2 * margin;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = height - margin;
  const navy = rgb(26 / 255, 46 / 255, 74 / 255);
  const border = rgb(220 / 255, 224 / 255, 230 / 255);
  const textColor = rgb(30 / 255, 41 / 255, 59 / 255);

  function addPage() {
    page = pdf.addPage([595.28, 841.89]);
    y = height - margin;
  }

  function ensureSpace(required: number) {
    if (y - required < margin) addPage();
  }

  function drawHeading(label: string) {
    ensureSpace(32);
    page.drawText(label, { x: margin, y, size: 12, font: bold, color: navy });
    y -= 16;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: border,
    });
    y -= 14;
  }

  function drawBlock(label: string, value: string) {
    drawHeading(label);
    const lines = wrapText(value, contentWidth, font, 10);
    for (const line of lines) {
      ensureSpace(14);
      page.drawText(line, { x: margin, y, size: 10, font, color: textColor });
      y -= 13;
    }
    y -= 8;
  }

  function drawContainedImage(image: PDFImage, x: number, topY: number, maxW: number, maxH: number) {
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const imageW = image.width * scale;
    const imageH = image.height * scale;
    page.drawImage(image, {
      x: x + (maxW - imageW) / 2,
      y: topY - imageH,
      width: imageW,
      height: imageH,
    });
  }

  const jobRef =
    formatJobRefFormal(job.job_number as number | null | undefined) ||
    `JOB-${String(job.id).slice(0, 8)}`;
  const jobDate =
    job.date_onsite ??
    (job.created_at ? String(job.created_at).slice(0, 10) : "—");

  page.drawText("JOB SHEET", { x: margin, y, size: 22, font: bold, color: navy });
  page.drawText(company, { x: margin, y: y - 24, size: 12, font: bold, color: textColor });
  page.drawText(jobRef, { x: width - margin - 130, y, size: 14, font: bold, color: navy });
  y -= 58;

  const metaLines = [
    `Date: ${jobDate}`,
    `Client: ${clientName}`,
    `Engineer: ${engineer?.name ?? "—"}`,
    "Site address:",
    ...site.split("\n").map((line) => `  ${line}`),
  ];
  for (const line of metaLines) {
    page.drawText(line, { x: margin, y, size: 10, font, color: textColor });
    y -= 13;
  }
  y -= 12;

  drawBlock("Job description", text(job.description));
  drawBlock(
    "Work carried out",
    text(completion?.work_carried_out, "No completion notes recorded."),
  );
  drawBlock("Parts used", text(completion?.parts_used, "None recorded."));

  drawHeading("Materials & labour");
  const tableHeader = ["Description", "Qty", "Unit", "Line"];
  const colX = [margin, margin + 220, margin + 270, margin + 330];
  page.drawText(tableHeader[0], { x: colX[0], y, size: 9, font: bold });
  page.drawText(tableHeader[1], { x: colX[1], y, size: 9, font: bold });
  page.drawText(tableHeader[2], { x: colX[2], y, size: 9, font: bold });
  page.drawText(tableHeader[3], { x: colX[3], y, size: 9, font: bold });
  y -= 14;

  const matRows = (materials ?? []).length
    ? (materials ?? [])
    : [{ description: "No materials recorded", quantity: null, unit_price: null, total_price: null }];

  for (const row of matRows) {
    ensureSpace(16);
    const d = String(row.description ?? "").slice(0, 60) || "—";
    const qty = row.quantity != null ? String(row.quantity) : "";
    const unit = row.unit_price != null ? String(row.unit_price) : "";
    const line = row.total_price != null ? String(row.total_price) : "";
    page.drawText(d, { x: colX[0], y, size: 9, font, maxWidth: 200 });
    page.drawText(qty, { x: colX[1], y, size: 9, font });
    page.drawText(unit, { x: colX[2], y, size: 9, font });
    page.drawText(line, { x: colX[3], y, size: 9, font });
    y -= 12;
  }

  y -= 8;
  page.drawText(
    `Labour charge: ${job.labour_charge != null ? String(job.labour_charge) : "—"}`,
    { x: margin, y, size: 10, font },
  );
  y -= 14;
  page.drawText(
    `Materials total: ${job.total_materials != null ? String(job.total_materials) : "—"}`,
    { x: margin, y, size: 10, font },
  );
  y -= 40;

  const signature = await embedRemoteImage(
    pdf,
    job.signature_url ?? completion?.client_signature_url,
    "Client signature",
  );
  ensureSpace(120);
  page.drawText("Client signature", { x: margin, y, size: 11, font: bold });
  y -= 8;
  page.drawRectangle({
    x: margin,
    y: y - 80,
    width: width - 2 * margin,
    height: 72,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 1,
  });
  if (signature) {
    drawContainedImage(signature.image, margin + 8, y - 8, contentWidth - 16, 60);
  }
  y -= 100;

  const photoImages = (
    await Promise.all(
      (images ?? []).map((image) =>
        embedRemoteImage(
          pdf,
          image.image_url,
          text(image.image_name, "Engineer job photo"),
        ),
      ),
    )
  ).filter(Boolean) as PdfImageResult[];

  if (photoImages.length > 0) {
    drawHeading("Engineer work photos");
    const gap = 16;
    const photoW = (contentWidth - gap) / 2;
    const photoH = 150;
    for (let i = 0; i < photoImages.length; i += 2) {
      ensureSpace(photoH + 36);
      const row = photoImages.slice(i, i + 2);
      row.forEach((photo, idx) => {
        const x = margin + idx * (photoW + gap);
        page.drawRectangle({
          x,
          y: y - photoH,
          width: photoW,
          height: photoH,
          borderColor: border,
          borderWidth: 1,
        });
        drawContainedImage(photo.image, x + 6, y - 6, photoW - 12, photoH - 32);
        page.drawText(photo.label.slice(0, 42), {
          x: x + 6,
          y: y - photoH + 10,
          size: 8,
          font,
          color: textColor,
        });
      });
      y -= photoH + 18;
    }
  }

  const genDate = new Date().toISOString().slice(0, 10);
  page.drawText(`${jobRef} · Generated ${genDate}`, {
    x: margin,
    y: margin,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

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

  if (fileErr) {
    return NextResponse.json({ error: fileErr.message }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from("jobs")
    .update({
      jobsheet_url: url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("tenant_id", tenantId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, url });
}
