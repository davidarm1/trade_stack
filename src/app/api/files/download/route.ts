import { NextResponse } from "next/server";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { b2DownloadPathForKey, normalizeB2ObjectKey } from "@/lib/b2-links";
import { getSignedDownloadUrl } from "@/lib/b2";

export const runtime = "nodejs";

function canReadTenantFiles(role: string | null): boolean {
  return role === "owner" || role === "office" || role === "viewer";
}

function canReadEngineerFiles(role: string | null): boolean {
  return role === "owner" || role === "office" || role === "viewer" || role === "engineer";
}

export async function GET(request: Request) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;

  const rawKey = new URL(request.url).searchParams.get("key");
  const key = normalizeB2ObjectKey(rawKey);
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  const tenantPrefix = `tradestack/${session.tenantId}/`;
  if (!key.startsWith(tenantPrefix)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: file, error } = await session.supabase
    .from("tenant_files")
    .select("id, job_id, file_type, b2_key")
    .eq("tenant_id", session.tenantId)
    .eq("b2_key", key)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileType = String(file.file_type ?? "").toLowerCase();
  const engineerRestrictedTypes = new Set(["jobsheet", "signature", "photo"]);

  if (engineerRestrictedTypes.has(fileType)) {
    if (!canReadEngineerFiles(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (session.role === "engineer") {
      if (!file.job_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { data: job, error: jobError } = await session.supabase
        .from("jobs")
        .select("assigned_engineer_membership_id")
        .eq("id", file.job_id)
        .eq("tenant_id", session.tenantId)
        .maybeSingle();
      if (jobError) {
        return NextResponse.json({ error: jobError.message }, { status: 500 });
      }
      if (!job || job.assigned_engineer_membership_id !== session.membershipId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else if (!canReadTenantFiles(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const signedUrl = await getSignedDownloadUrl(key, 900);
  const response = NextResponse.redirect(signedUrl, { status: 302 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
