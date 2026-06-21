import { NextResponse } from "next/server";
import {
  getSessionTenantOrError,
  rejectForeignTenantId,
} from "@/lib/api-auth";
import { uploadToB2 } from "@/lib/b2";
import { b2DownloadPathForKey } from "@/lib/b2-links";

export const runtime = "nodejs";

function logSaveSignatureError(
  stage: string,
  details: Record<string, unknown>,
) {
  console.error("[save-signature]", stage, details);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getSessionTenantOrError();
    if (!session.ok) return session.response;

    const { jobId } = await context.params;
    let body: { tenantId?: string; jobId?: string; signatureDataUrl?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch (error) {
      logSaveSignatureError("invalid-json", { error });
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const mismatch = rejectForeignTenantId(body.tenantId, session.tenantId);
    if (mismatch) {
      logSaveSignatureError("tenant-mismatch", {
        jobId,
        bodyTenantId: body.tenantId,
        sessionTenantId: session.tenantId,
      });
      return mismatch;
    }

    const dataUrl = body.signatureDataUrl;
    if (!dataUrl || typeof dataUrl !== "string") {
      logSaveSignatureError("missing-signature-data-url", {
        jobId,
        tenantId: session.tenantId,
        bodyKeys: Object.keys(body ?? {}),
      });
      return NextResponse.json(
        { error: "signatureDataUrl is required" },
        { status: 400 },
      );
    }

    const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim());
    if (!m?.[1]) {
      logSaveSignatureError("invalid-signature-data-url", {
        jobId,
        tenantId: session.tenantId,
        prefix: dataUrl.slice(0, 40),
        length: dataUrl.length,
      });
      return NextResponse.json(
        { error: "signatureDataUrl must be a base64 PNG data URL" },
        { status: 400 },
      );
    }

    const { supabase, tenantId } = session;

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, assigned_engineer_id, status")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .maybeSingle();

    if (jobErr || !job) {
      logSaveSignatureError("job-not-found", {
        jobId,
        tenantId,
        userId: session.userId,
        role: session.role,
        error: jobErr,
      });
      return NextResponse.json(
        { error: jobErr?.message ?? "Job not found" },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(m[1], "base64");
    const key = `tradestack/${tenantId}/signatures/${jobId}_signature.png`;
    let url: string;
    try {
      url = await uploadToB2(buffer, key, "image/png");
    } catch (error) {
      logSaveSignatureError("b2-upload-failed", {
        jobId,
        tenantId,
        userId: session.userId,
        role: session.role,
        key,
        byteLength: buffer.length,
        error,
      });
      return NextResponse.json(
        { error: "Signature upload to Backblaze failed" },
        { status: 500 },
      );
    }

    const signedAt = new Date().toISOString();

    const { error: fileErr } = await supabase.from("tenant_files").insert({
      tenant_id: tenantId,
      job_id: jobId,
      file_type: "signature",
      b2_key: key,
      file_name: `${jobId}_signature.png`,
      file_size_bytes: buffer.length,
      public_url: key,
    });

    if (fileErr) {
      logSaveSignatureError("tenant-files-insert-failed", {
        jobId,
        tenantId,
        userId: session.userId,
        role: session.role,
        assignedEngineerId: job.assigned_engineer_id,
        jobStatus: job.status,
        key,
        url,
        error: fileErr,
      });
      return NextResponse.json({ error: fileErr.message }, { status: 500 });
    }

    const { error: updErr } = await supabase
      .from("jobs")
      .update({
        signature_url: key,
        signed_at: signedAt,
        updated_at: signedAt,
      })
      .eq("id", jobId)
      .eq("tenant_id", tenantId);

    if (updErr) {
      logSaveSignatureError("jobs-update-failed", {
        jobId,
        tenantId,
        userId: session.userId,
        role: session.role,
        url,
        error: updErr,
      });
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: b2DownloadPathForKey(key) });
  } catch (error) {
    logSaveSignatureError("unhandled-error", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unhandled error" },
      { status: 500 },
    );
  }
}
