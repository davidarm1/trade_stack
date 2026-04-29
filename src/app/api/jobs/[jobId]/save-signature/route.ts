import { NextResponse } from "next/server";
import {
  getSessionTenantOrError,
  rejectForeignTenantId,
} from "@/lib/api-auth";
import { uploadToB2 } from "@/lib/b2";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;

  const { jobId } = await context.params;
  let body: { tenantId?: string; jobId?: string; signatureDataUrl?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mismatch = rejectForeignTenantId(body.tenantId, session.tenantId);
  if (mismatch) return mismatch;

  const dataUrl = body.signatureDataUrl;
  if (!dataUrl || typeof dataUrl !== "string") {
    return NextResponse.json(
      { error: "signatureDataUrl is required" },
      { status: 400 },
    );
  }

  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim());
  if (!m?.[1]) {
    return NextResponse.json(
      { error: "signatureDataUrl must be a base64 PNG data URL" },
      { status: 400 },
    );
  }

  const { supabase, tenantId } = session;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const buffer = Buffer.from(m[1], "base64");
  const key = `tradestack/${tenantId}/signatures/${jobId}_signature.png`;
  const url = await uploadToB2(buffer, key, "image/png");

  const signedAt = new Date().toISOString();

  const { error: fileErr } = await supabase.from("tenant_files").insert({
    tenant_id: tenantId,
    job_id: jobId,
    file_type: "signature",
    b2_key: key,
    file_name: `${jobId}_signature.png`,
    file_size_bytes: buffer.length,
    public_url: url,
  });

  if (fileErr) {
    return NextResponse.json({ error: fileErr.message }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from("jobs")
    .update({
      signature_url: url,
      signed_at: signedAt,
      status: "signed",
      updated_at: signedAt,
    })
    .eq("id", jobId)
    .eq("tenant_id", tenantId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, url });
}
