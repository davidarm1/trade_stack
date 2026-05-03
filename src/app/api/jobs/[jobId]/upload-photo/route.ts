import { NextResponse } from "next/server";
import {
  getSessionTenantOrError,
  rejectForeignTenantId,
} from "@/lib/api-auth";
import { uploadToB2 } from "@/lib/b2";

export const runtime = "nodejs";

function logUploadPhotoError(stage: string, details: Record<string, unknown>) {
  console.error("[job-upload-photo]", stage, details);
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await getSessionTenantOrError();
    if (!session.ok) return session.response;

    const { jobId } = await context.params;
    let body: {
      tenantId?: string;
      photoDataUrl?: string;
      fileName?: string;
      index?: number;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch (error) {
      logUploadPhotoError("invalid-json", { error });
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const mismatch = rejectForeignTenantId(body.tenantId, session.tenantId);
    if (mismatch) {
      logUploadPhotoError("tenant-mismatch", {
        jobId,
        bodyTenantId: body.tenantId,
        sessionTenantId: session.tenantId,
      });
      return mismatch;
    }

    const photoDataUrl = body.photoDataUrl;
    if (!photoDataUrl || typeof photoDataUrl !== "string") {
      return NextResponse.json(
        { error: "photoDataUrl is required" },
        { status: 400 },
      );
    }

    const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(
      photoDataUrl.trim(),
    );
    if (!match?.[1] || !match[2]) {
      logUploadPhotoError("invalid-photo-data-url", {
        jobId,
        tenantId: session.tenantId,
        prefix: photoDataUrl.slice(0, 40),
        length: photoDataUrl.length,
      });
      return NextResponse.json(
        { error: "photoDataUrl must be a base64 image data URL" },
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
      logUploadPhotoError("job-not-found", {
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

    const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
    const buffer = Buffer.from(match[2], "base64");
    const ext = extensionForMime(mimeType);
    const safeIndex =
      typeof body.index === "number" && Number.isFinite(body.index)
        ? body.index
        : Date.now();
    const fileName = body.fileName?.trim() || `field_${safeIndex}.${ext}`;
    const key = `tradestack/${tenantId}/job-photos/${jobId}/${Date.now()}_${safeIndex}.${ext}`;

    let url: string;
    try {
      url = await uploadToB2(buffer, key, mimeType);
    } catch (error) {
      logUploadPhotoError("b2-upload-failed", {
        jobId,
        tenantId,
        userId: session.userId,
        role: session.role,
        key,
        byteLength: buffer.length,
        error,
      });
      return NextResponse.json(
        { error: "Job photo upload to Backblaze failed" },
        { status: 500 },
      );
    }

    const { error: fileErr } = await supabase.from("tenant_files").insert({
      tenant_id: tenantId,
      job_id: jobId,
      file_type: "photo",
      b2_key: key,
      file_name: fileName,
      file_size_bytes: buffer.length,
      public_url: url,
    });

    if (fileErr) {
      logUploadPhotoError("tenant-files-insert-failed", {
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

    return NextResponse.json({ success: true, url, key });
  } catch (error) {
    logUploadPhotoError("unhandled-error", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unhandled error" },
      { status: 500 },
    );
  }
}
