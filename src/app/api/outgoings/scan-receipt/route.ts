import { NextResponse } from "next/server";
import { after } from "next/server";
import OpenAI from "openai";
import { createHash } from "crypto";
import { getSessionTenantOrError, rejectForeignTenantId } from "@/lib/api-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { deleteFromB2ByKey, uploadToB2 } from "@/lib/b2";
import {
  baselineLineSumForReceipt,
  parseReceiptLineItems,
  recalculateAmountsFromLines,
} from "@/lib/receipt-line-items";

export const runtime = "nodejs";

/** Allow background upload + OCR to finish on hosts that honor this (e.g. Vercel). */
export const maxDuration = 300;

const SYSTEM =
  "You are a receipt parser. Extract data from this receipt or invoice image and return ONLY a JSON object with these fields: supplier_name, date (YYYY-MM-DD), total_amount (number), vat_amount (number or null), description, currency (default GBP), items (array of line objects or null). Each line object may include: description, quantity, unit_price, total (line gross), net, tax. If the receipt shows multiple product/service lines, fill items; otherwise items can be null. Return null for any field you cannot determine. Return JSON only, no markdown, no explanation.";

function insufficientPermissions() {
  return NextResponse.json(
    { error: "Insufficient permissions" },
    { status: 403 },
  );
}

function canManageOutgoings(role: string | null): boolean {
  return role === "owner" || role === "office";
}

type LinkedReceiptContext = {
  jobId: string | null;
  clientId: string | null;
};

async function validateLinkedJobContext(args: {
  session: Extract<
    Awaited<ReturnType<typeof getSessionTenantOrError>>,
    { ok: true }
  >;
  jobId?: string | null;
  clientId?: string | null;
}): Promise<
  | { ok: true; context: LinkedReceiptContext }
  | { ok: false; response: NextResponse }
> {
  const jobId = String(args.jobId ?? "").trim() || null;
  const clientId = String(args.clientId ?? "").trim() || null;

  if (canManageOutgoings(args.session.role)) {
    if (!jobId && !clientId) return { ok: true, context: { jobId, clientId } };
  } else if (args.session.role !== "engineer") {
    return { ok: false, response: insufficientPermissions() };
  } else if (!jobId) {
    return { ok: false, response: insufficientPermissions() };
  }

  if (jobId) {
    const { data: job, error } = await args.session.supabase
      .from("jobs")
      .select(
        "id, client_id, assigned_engineer_id, invoice_paid_at, deleted_at",
      )
      .eq("id", jobId)
      .eq("tenant_id", args.session.tenantId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        response: NextResponse.json({ error: error.message }, { status: 500 }),
      };
    }
    if (!job || job.deleted_at || job.invoice_paid_at) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Linked job is not available" },
          { status: 403 },
        ),
      };
    }
    if (
      args.session.role === "engineer" &&
      job.assigned_engineer_id !== args.session.userId
    ) {
      return { ok: false, response: insufficientPermissions() };
    }
    if (clientId && job.client_id && job.client_id !== clientId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "clientId does not match linked job" },
          { status: 400 },
        ),
      };
    }
  }

  if (clientId) {
    const { data: client, error } = await args.session.supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("tenant_id", args.session.tenantId)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        response: NextResponse.json({ error: error.message }, { status: 500 }),
      };
    }
    if (!client) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Linked client is not available" },
          { status: 403 },
        ),
      };
    }
  }

  return { ok: true, context: { jobId, clientId } };
}

type Parsed = {
  supplier_name: string | null;
  date: string | null;
  total_amount: number | null;
  vat_amount: number | null;
  description: string | null;
  currency: string | null;
  items: unknown[] | null;
};

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "bin";
  return (
    name
      .slice(i + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin"
  );
}

function mimeForExt(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

async function runReceiptOcrAfterUpload(args: {
  supabase: SupabaseClient;
  receiptId: string;
  tenantId: string;
  buf: Buffer;
  ext: string;
  mime: string;
  fileName: string;
  isPdf: boolean;
  url: string;
}) {
  const {
    supabase,
    receiptId,
    tenantId,
    buf,
    ext,
    mime,
    fileName,
    isPdf,
    url,
  } = args;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[scan-receipt] OPENAI_API_KEY missing in background OCR");
    return;
  }

  const openai = new OpenAI({ apiKey });
  const model = "gpt-4o-mini";

  console.log("[scan-receipt] OCR starting", {
    receiptId,
    tenantId,
    fileName,
    mime,
    isPdf,
    url,
  });

  let parsed: Parsed | null = null;
  let scanConfidence: "high" | "low" | "failed" = "failed";
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;

  let completionRaw = "";
  try {
    if (isPdf) {
      const resp = await openai.responses.create({
        model,
        input: [
          {
            role: "system",
            content: SYSTEM,
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Extract structured data from this receipt/invoice PDF.",
              },
              {
                type: "input_file",
                filename: fileName,
                file_data: `data:${mime};base64,${buf.toString("base64")}`,
              },
            ],
          },
        ],
      } as never);
      promptTokens = resp.usage?.input_tokens ?? null;
      completionTokens = resp.usage?.output_tokens ?? null;
      totalTokens = resp.usage?.total_tokens ?? null;
      completionRaw = resp.output_text ?? "";
    } else {
      const completion = await openai.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract structured data from this receipt image.",
              },
              {
                type: "image_url",
                image_url: { url, detail: "high" },
              },
            ],
          },
        ],
      });
      const usage = completion.usage;
      promptTokens = usage?.prompt_tokens ?? null;
      completionTokens = usage?.completion_tokens ?? null;
      totalTokens = usage?.total_tokens ?? null;
      completionRaw = completion.choices[0]?.message?.content ?? "";
    }
  } catch (e) {
    console.error("[scan-receipt] OpenAI request failed:", e);
    completionRaw = "";
  }

  console.log("[scan-receipt] OCR response received", {
    receiptId,
    hasOutput: completionRaw.length > 0,
    promptTokens,
    completionTokens,
    totalTokens,
  });

  if (completionRaw) {
    try {
      const obj = JSON.parse(completionRaw) as Record<string, unknown>;
      const rawItems = obj.items;
      parsed = {
        supplier_name:
          typeof obj.supplier_name === "string" ? obj.supplier_name : null,
        date: typeof obj.date === "string" ? obj.date : null,
        total_amount:
          typeof obj.total_amount === "number" ? obj.total_amount : null,
        vat_amount: typeof obj.vat_amount === "number" ? obj.vat_amount : null,
        description:
          typeof obj.description === "string" ? obj.description : null,
        currency: typeof obj.currency === "string" ? obj.currency : "GBP",
        items: Array.isArray(rawItems) ? rawItems : null,
      };
      const hasAny =
        parsed.supplier_name ||
        parsed.date ||
        parsed.total_amount != null ||
        parsed.description ||
        (parsed.items && parsed.items.length > 0);
      scanConfidence = hasAny ? "high" : "low";
    } catch {
      parsed = {
        supplier_name: null,
        date: null,
        total_amount: null,
        vat_amount: null,
        description: null,
        currency: "GBP",
        items: null,
      };
      scanConfidence = "failed";
    }
  } else {
    parsed = {
      supplier_name: null,
      date: null,
      total_amount: null,
      vat_amount: null,
      description: null,
      currency: "GBP",
      items: null,
    };
    scanConfidence = "failed";
  }

  const { error: usageErr } = await supabase.from("ai_usage").insert({
    tenant_id: tenantId,
    feature: "receipt_scan",
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    cost_usd: null,
  });

  if (usageErr) {
    console.error("[scan-receipt] ai_usage insert failed:", usageErr.message);
  }

  const aiConfidence =
    scanConfidence === "high" ? 0.9 : scanConfidence === "low" ? 0.45 : null;

  const notesFromOcr =
    typeof parsed?.description === "string" && parsed.description.trim()
      ? parsed.description.trim()
      : null;

  const lineItemsNormalized = parseReceiptLineItems(parsed?.items ?? []);
  const baseline = {
    lineSum: baselineLineSumForReceipt({
      line_items: lineItemsNormalized,
      amount_total: parsed?.total_amount ?? null,
    }),
    amount_tax: parsed?.vat_amount ?? null,
    amount_net:
      parsed?.total_amount != null && parsed?.vat_amount != null
        ? parsed.total_amount - parsed.vat_amount
        : null,
    amount_total: parsed?.total_amount ?? null,
  };
  const amountsFromLines =
    lineItemsNormalized.length > 0
      ? recalculateAmountsFromLines(lineItemsNormalized, baseline)
      : null;

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("receipts")
    .update({
      supplier_name: parsed?.supplier_name ?? null,
      invoice_date: parsed?.date ?? null,
      amount_total:
        amountsFromLines?.amount_total ?? parsed?.total_amount ?? null,
      amount_tax: amountsFromLines?.amount_tax ?? parsed?.vat_amount ?? null,
      amount_net:
        amountsFromLines?.amount_net ??
        (parsed?.total_amount != null && parsed?.vat_amount != null
          ? parsed.total_amount - parsed.vat_amount
          : null),
      line_items: lineItemsNormalized,
      notes: notesFromOcr,
      currency: parsed?.currency ?? "GBP",
      processed_by_ai: true,
      ai_processed_at: now,
      ai_confidence: aiConfidence,
      updated_at: now,
    })
    .eq("id", receiptId)
    .eq("tenant_id", tenantId);

  if (updateErr) {
    console.error(
      "[scan-receipt] receipt OCR update failed:",
      updateErr.message,
    );
  } else {
    console.log("[scan-receipt] receipt OCR update complete", {
      receiptId,
      scanConfidence,
      supplierName: parsed?.supplier_name ?? null,
      totalAmount: parsed?.total_amount ?? null,
    });
  }
}

async function processReceiptUploadInBackground(args: {
  tenantId: string;
  userId: string;
  linkedContext: LinkedReceiptContext;
  buf: Buffer;
  key: string;
  mime: string;
  ext: string;
  fileSha: string;
  displayFileName: string;
}) {
  const {
    tenantId,
    userId,
    linkedContext,
    buf,
    key,
    mime,
    ext,
    fileSha,
    displayFileName,
  } = args;

  let supa: SupabaseClient;
  try {
    supa = createServiceRoleClient();
  } catch {
    supa = await createClient();
  }

  let url: string;
  try {
    url = await uploadToB2(buf, key, mime);
  } catch (e) {
    console.error("[scan-receipt] B2 upload failed:", e);
    return;
  }

  const { error: fileErr } = await supa.from("tenant_files").insert({
    tenant_id: tenantId,
    job_id: linkedContext.jobId,
    file_type: "receipt",
    b2_key: key,
    file_name: displayFileName,
    file_size_bytes: buf.length,
    public_url: url,
  });

  if (fileErr) {
    console.error(
      "[scan-receipt] tenant_files insert failed:",
      fileErr.message,
    );
    try {
      await deleteFromB2ByKey(key);
    } catch {
      /* ignore */
    }
    return;
  }

  const isPdf = ext === "pdf" || mime === "application/pdf";
  const fileName = displayFileName;
  const now = new Date().toISOString();

  const { data: receiptRow, error: recErr } = await supa
    .from("receipts")
    .insert({
      tenant_id: tenantId,
      job_id: linkedContext.jobId,
      client_id: linkedContext.clientId,
      uploaded_by_id: userId,
      receipt_url: url,
      supplier_name: null,
      invoice_date: null,
      amount_total: null,
      amount_tax: null,
      line_items: [],
      notes: null,
      currency: "GBP",
      processed_by_ai: false,
      ai_processed_at: null,
      ai_confidence: null,
      updated_at: now,
    })
    .select("id")
    .single();

  if (recErr || !receiptRow) {
    console.error("[scan-receipt] receipts insert failed:", recErr?.message);
    try {
      await supa
        .from("tenant_files")
        .delete()
        .eq("b2_key", key)
        .eq("tenant_id", tenantId);
    } catch {
      /* ignore */
    }
    try {
      await deleteFromB2ByKey(key);
    } catch {
      /* ignore */
    }
    return;
  }

  await runReceiptOcrAfterUpload({
    supabase: supa,
    receiptId: receiptRow.id,
    tenantId,
    buf,
    ext,
    mime,
    fileName,
    isPdf,
    url,
  });
}

async function processUploadedObjectInBackground(args: {
  tenantId: string;
  userId: string;
  linkedContext: LinkedReceiptContext;
  key: string;
  url: string;
  mime: string;
  fileName: string;
}) {
  const { tenantId, userId, linkedContext, key, url, mime, fileName } = args;
  const ext = extFromName(fileName);

  console.log("[scan-receipt] background finalize starting", {
    tenantId,
    userId,
    linkedContext,
    key,
    url,
    mime,
    fileName,
  });

  let supa: SupabaseClient;
  try {
    supa = createServiceRoleClient();
  } catch {
    supa = await createClient();
  }

  const { error: fileErr } = await supa.from("tenant_files").insert({
    tenant_id: tenantId,
    job_id: linkedContext.jobId,
    file_type: "receipt",
    b2_key: key,
    file_name: fileName,
    file_size_bytes: null,
    public_url: url,
  });
  if (fileErr) {
    console.error(
      "[scan-receipt] tenant_files insert failed:",
      fileErr.message,
    );
    return;
  }

  console.log("[scan-receipt] tenant_files row created", {
    tenantId,
    key,
    linkedContext,
  });

  const now = new Date().toISOString();
  const { data: receiptRow, error: recErr } = await supa
    .from("receipts")
    .insert({
      tenant_id: tenantId,
      job_id: linkedContext.jobId,
      client_id: linkedContext.clientId,
      uploaded_by_id: userId,
      receipt_url: url,
      supplier_name: null,
      invoice_date: null,
      amount_total: null,
      amount_tax: null,
      line_items: [],
      notes: null,
      currency: "GBP",
      processed_by_ai: false,
      ai_processed_at: null,
      ai_confidence: null,
      updated_at: now,
    })
    .select("id")
    .single();
  if (recErr || !receiptRow) {
    console.error("[scan-receipt] receipts insert failed:", recErr?.message);
    return;
  }

  console.log("[scan-receipt] receipt row created", {
    receiptId: receiptRow.id,
    tenantId,
    linkedContext,
  });

  let buf: Buffer;
  try {
    const downloaded = await fetch(url, { cache: "no-store" });
    if (!downloaded.ok)
      throw new Error(`download failed: ${downloaded.status}`);
    buf = Buffer.from(await downloaded.arrayBuffer());
    console.log("[scan-receipt] uploaded object downloaded for OCR", {
      receiptId: receiptRow.id,
      bytes: buf.length,
      url,
    });
  } catch (e) {
    console.error("[scan-receipt] failed to download uploaded object:", e);
    return;
  }

  await runReceiptOcrAfterUpload({
    supabase: supa,
    receiptId: receiptRow.id,
    tenantId,
    buf,
    ext,
    mime,
    fileName,
    isPdf: ext === "pdf" || mime === "application/pdf",
    url,
  });
}

export async function POST(request: Request) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;

  const contentType = request.headers.get("content-type") || "";
  let linkedContext: LinkedReceiptContext = { jobId: null, clientId: null };
  if (contentType.includes("application/json")) {
    let body: {
      tenantId?: string;
      key?: string;
      publicUrl?: string;
      fileName?: string;
      fileType?: string;
      jobId?: string | null;
      clientId?: string | null;
    } | null = null;
    try {
      body = (await request.json()) as {
        tenantId?: string;
        key?: string;
        publicUrl?: string;
        fileName?: string;
        fileType?: string;
        jobId?: string | null;
        clientId?: string | null;
      };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const mismatch = rejectForeignTenantId(body?.tenantId, session.tenantId);
    if (mismatch) return mismatch;
    const linked = await validateLinkedJobContext({
      session,
      jobId: body?.jobId,
      clientId: body?.clientId,
    });
    if (!linked.ok) return linked.response;
    linkedContext = linked.context;
    const key = (body?.key || "").trim();
    const publicUrl = (body?.publicUrl || "").trim();
    const fileName = (body?.fileName || "receipt.pdf").trim();
    const mime =
      (body?.fileType || "").trim() || mimeForExt(extFromName(fileName));
    if (!key || !publicUrl) {
      return NextResponse.json(
        { error: "Missing upload metadata" },
        { status: 400 },
      );
    }
    if (!key.startsWith(`tradestack/${session.tenantId}/receipts/`)) {
      return NextResponse.json(
        { error: "Invalid object key for tenant" },
        { status: 403 },
      );
    }

    after(() => {
      void processUploadedObjectInBackground({
        tenantId: session.tenantId,
        userId: session.userId,
        linkedContext,
        key,
        url: publicUrl,
        mime,
        fileName,
      }).catch((e) => {
        console.error("[scan-receipt] background finalize error:", e);
      });
    });
    return NextResponse.json({
      success: true,
      accepted: true,
      pendingOcr: true,
      outgoing: {
        supplier_name: null,
        date: null,
        total_amount: null,
        vat_amount: null,
        description: null,
        currency: "GBP",
        scan_confidence: "pending" as const,
      },
    });
  }

  const form = await request.formData();
  const bodyTenantId = form.get("tenantId");
  const mismatch = rejectForeignTenantId(
    typeof bodyTenantId === "string" ? bodyTenantId : undefined,
    session.tenantId,
  );
  if (mismatch) return mismatch;

  const linked = await validateLinkedJobContext({
    session,
    jobId:
      typeof form.get("jobId") === "string" ? String(form.get("jobId")) : null,
    clientId:
      typeof form.get("clientId") === "string"
        ? String(form.get("clientId"))
        : null,
  });
  if (!linked.ok) return linked.response;
  linkedContext = linked.context;

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "multipart field 'file' is required" },
      { status: 400 },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = extFromName(file.name || "receipt.jpg");
  const fileSha = createHash("sha256").update(buf).digest("hex");
  const key = `tradestack/${session.tenantId}/receipts/${fileSha}_receipt.${ext}`;
  const mime = file.type || mimeForExt(ext);
  const { supabase, tenantId, userId } = session;

  const { data: existingFile } = await supabase
    .from("tenant_files")
    .select("id, public_url")
    .eq("tenant_id", tenantId)
    .eq("b2_key", key)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingFile) {
    const { count: receiptCount, error: countErr } = await supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("receipt_url", existingFile.public_url);

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    if ((receiptCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: "Duplicate file detected: this invoice was already uploaded.",
          duplicate: true,
          receiptUrl: existingFile.public_url,
        },
        { status: 409 },
      );
    }

    const { error: orphanErr } = await supabase
      .from("tenant_files")
      .delete()
      .eq("id", existingFile.id)
      .eq("tenant_id", tenantId);

    if (orphanErr) {
      return NextResponse.json({ error: orphanErr.message }, { status: 500 });
    }
  }

  const displayFileName = file.name || `${fileSha}_receipt.${ext}`;

  after(() => {
    void processReceiptUploadInBackground({
      tenantId,
      userId,
      linkedContext,
      buf,
      key,
      mime,
      ext,
      fileSha,
      displayFileName,
    }).catch((e) => {
      console.error("[scan-receipt] background pipeline error:", e);
    });
  });

  return NextResponse.json({
    success: true,
    accepted: true,
    pendingOcr: true,
    outgoing: {
      supplier_name: null,
      date: null,
      total_amount: null,
      vat_amount: null,
      description: null,
      currency: "GBP",
      scan_confidence: "pending" as const,
    },
  });
}
