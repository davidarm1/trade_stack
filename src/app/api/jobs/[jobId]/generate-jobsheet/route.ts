import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  getSessionTenantOrError,
  rejectForeignTenantId,
} from "@/lib/api-auth";
import { uploadToB2 } from "@/lib/b2";
import { formatJobRefFormal } from "@/lib/job-number";

export const runtime = "nodejs";

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

  const [{ data: tenant }, { data: client }, { data: materials }, { data: engineer }] =
    await Promise.all([
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
    ]);

  const company = tenant?.name ?? "Company";
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
  const page = pdf.addPage();
  const { width, height } = page.getSize();
  const margin = 48;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = height - margin;

  const jobRef =
    formatJobRefFormal(job.job_number as number | null | undefined) ||
    `JOB-${String(job.id).slice(0, 8)}`;
  const jobDate =
    job.date_onsite ??
    (job.created_at ? String(job.created_at).slice(0, 10) : "—");

  page.drawRectangle({
    x: margin,
    y: y - 64,
    width: 120,
    height: 48,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 1,
  });
  page.drawText("Logo", {
    x: margin + 40,
    y: y - 40,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText(company, {
    x: margin + 140,
    y: y - 28,
    size: 16,
    font: bold,
  });
  y -= 80;

  page.drawText("Job sheet", { x: margin, y, size: 14, font: bold });
  y -= 22;
  const lines = [
    `Job: ${jobRef}`,
    `Date: ${jobDate}`,
    `Client: ${clientName}`,
    `Site address:`,
    ...site.split("\n").map((l) => `  ${l}`),
    ``,
    `Engineer: ${engineer?.name ?? "—"}`,
    ``,
    `Description`,
  ];
  for (const line of lines) {
    page.drawText(line, { x: margin, y, size: 10, font, maxWidth: width - 2 * margin });
    y -= 12;
  }

  const rawDesc = job.description ?? "—";
  const descLines = rawDesc
    .split("\n")
    .flatMap((line: string) =>
      line.length <= 95 ? [line] : line.match(/.{1,95}/g) ?? [line],
    );
  for (const line of descLines) {
    if (y < margin + 200) break;
    page.drawText(line, {
      x: margin,
      y,
      size: 9,
      font,
      maxWidth: width - 2 * margin,
    });
    y -= 11;
  }
  y -= 14;

  page.drawText("Materials & labour", { x: margin, y, size: 12, font: bold });
  y -= 16;

  const tableHeader = ["Description", "Qty", "Unit", "Line"];
  const colX = [margin, margin + 220, margin + 270, margin + 330];
  page.drawText(tableHeader[0], { x: colX[0], y, size: 9, font: bold });
  page.drawText(tableHeader[1], { x: colX[1], y, size: 9, font: bold });
  page.drawText(tableHeader[2], { x: colX[2], y, size: 9, font: bold });
  page.drawText(tableHeader[3], { x: colX[3], y, size: 9, font: bold });
  y -= 14;

  const matRows = (materials ?? []).length
    ? (materials ?? [])
    : [
        {
          description: "",
          quantity: null,
          unit_price: null,
          total_price: null,
        },
        {
          description: "",
          quantity: null,
          unit_price: null,
          total_price: null,
        },
      ];

  for (const row of matRows) {
    if (y < margin + 120) break;
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
  y -= 100;

  const genDate = new Date().toISOString().slice(0, 10);
  page.drawText(`${jobRef} · Generated ${genDate}`, {
    x: margin,
    y: margin,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  const bytes = await pdf.save();
  const buffer = Buffer.from(bytes);
  const key = `tradestack/${tenantId}/jobsheets/${jobId}.pdf`;
  const url = await uploadToB2(buffer, key, "application/pdf");

  const { error: fileErr } = await supabase.from("tenant_files").insert({
    tenant_id: tenantId,
    job_id: jobId,
    file_type: "jobsheet",
    b2_key: key,
    file_name: `${jobRef.replace(/[^\w-]+/g, "_")}.pdf`,
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
