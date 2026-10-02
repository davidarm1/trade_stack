import { NextResponse } from "next/server";
import { after } from "next/server";
import { createHash } from "crypto";
import { getSessionTenantOrError, rejectForeignTenantId } from "@/lib/api-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { deleteFromB2ByKey, getSignedDownloadUrl, uploadToB2 } from "@/lib/b2";
import { b2DownloadPathForKey, normalizeB2ObjectKey } from "@/lib/b2-links";
import {
  extFromName,
  mimeForExt,
  parseRequestedPaymentStatus,
  paymentStatusForSelection,
  runReceiptOcr,
  type PaymentStatusSelection,
} from "@/lib/receipt-ocr";

export const runtime = "nodejs";

/** Allow background upload + OCR to finish on hosts that honor this (e.g. Vercel). */
export const maxDuration = 300;

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
  } else if (!jobId && !clientId) {
    return { ok: true, context: { jobId, clientId } };
  }

  if (jobId) {
    const { data: job, error } = await args.session.supabase
      .from("jobs")
      .select(
        "id, client_id, assigned_engineer_membership_id, invoice_paid_at, deleted_at",
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
      job.assigned_engineer_membership_id !== args.session.membershipId
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

async function processReceiptUploadInBackground(args: {
  tenantId: string;
  userId: string;
  membershipId: string | null;
  linkedContext: LinkedReceiptContext;
  buf: Buffer;
  key: string;
  mime: string;
  ext: string;
  fileSha: string;
  displayFileName: string;
  requestedPaymentStatus: PaymentStatusSelection;
}) {
  const {
    tenantId,
    userId,
    membershipId,
    linkedContext,
    buf,
    key,
    mime,
    ext,
    fileSha,
    displayFileName,
    requestedPaymentStatus,
  } = args;

  let supa: SupabaseClient;
  try {
    supa = createServiceRoleClient();
  } catch {
    supa = await createClient();
  }

  try {
    await uploadToB2(buf, key, mime);
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
    public_url: key,
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
      uploaded_by_membership_id: membershipId,
      receipt_url: key,
      supplier_name: null,
      invoice_date: null,
      amount_total: null,
      amount_tax: null,
      line_items: [],
      notes: null,
      currency: "GBP",
      payment_status: paymentStatusForSelection(requestedPaymentStatus),
      due_date: null,
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

  const downloadUrl = await getSignedDownloadUrl(key);

  await runReceiptOcr({
    supabase: supa,
    receiptId: receiptRow.id,
    tenantId,
    buf,
    mime,
    fileName,
    isPdf,
    url: downloadUrl,
    requestedPaymentStatus,
  });
}

async function processUploadedObjectInBackground(args: {
  tenantId: string;
  userId: string;
  membershipId: string | null;
  linkedContext: LinkedReceiptContext;
  key: string;
  url: string;
  mime: string;
  fileName: string;
  requestedPaymentStatus: PaymentStatusSelection;
}) {
  const { tenantId, userId, membershipId, linkedContext, key, url, mime, fileName, requestedPaymentStatus } = args;
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
    public_url: key,
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
      uploaded_by_membership_id: membershipId,
      receipt_url: key,
      supplier_name: null,
      invoice_date: null,
      amount_total: null,
      amount_tax: null,
      line_items: [],
      notes: null,
      currency: "GBP",
      payment_status: paymentStatusForSelection(requestedPaymentStatus),
      due_date: null,
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

  await runReceiptOcr({
    supabase: supa,
    receiptId: receiptRow.id,
    tenantId,
    buf,
    mime,
    fileName,
    isPdf: ext === "pdf" || mime === "application/pdf",
    url,
    requestedPaymentStatus,
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
      payment_status?: string | null;
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
        payment_status?: string | null;
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
    const requestedPaymentStatus = parseRequestedPaymentStatus(body?.payment_status);
    const key = normalizeB2ObjectKey(body?.key) ?? normalizeB2ObjectKey(body?.publicUrl);
    const fileName = (body?.fileName || "receipt.pdf").trim();
    const mime =
      (body?.fileType || "").trim() || mimeForExt(extFromName(fileName));
    if (!key) {
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

    const signedUrl = await getSignedDownloadUrl(key);

    after(() => {
      void processUploadedObjectInBackground({
        tenantId: session.tenantId,
        userId: session.userId,
        membershipId: session.membershipId,
        linkedContext,
        key,
        url: signedUrl,
        mime,
        fileName,
        requestedPaymentStatus,
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
  const requestedPaymentStatus = parseRequestedPaymentStatus(form.get("payment_status"));

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
  const { supabase, tenantId, userId, membershipId } = session;

  const { data: existingFile } = await supabase
    .from("tenant_files")
    .select("id, b2_key, public_url")
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
          receiptUrl: b2DownloadPathForKey(existingFile.b2_key ?? key),
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
      membershipId,
      linkedContext,
      buf,
      key,
      mime,
      ext,
      fileSha,
      displayFileName,
      requestedPaymentStatus,
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
