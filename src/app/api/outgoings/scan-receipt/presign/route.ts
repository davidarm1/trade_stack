import { NextResponse } from "next/server";
import { getSessionTenantOrError, rejectForeignTenantId } from "@/lib/api-auth";
import { presignB2PutObject, publicUrlForB2Key } from "@/lib/b2";

export const runtime = "nodejs";

type Body = {
  tenantId?: string;
  fileName?: string;
  fileType?: string;
  fileSha?: string;
};

function insufficientPermissions() {
  return NextResponse.json(
    { error: "Insufficient permissions" },
    { status: 403 },
  );
}

function canManageOutgoings(role: string | null): boolean {
  return role === "owner" || role === "office";
}

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "bin";
  return name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

function mimeForExt(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function POST(request: Request) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;
  if (!canManageOutgoings(session.role)) return insufficientPermissions();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mismatch = rejectForeignTenantId(body.tenantId, session.tenantId);
  if (mismatch) return mismatch;

  const fileSha = (body.fileSha || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fileSha)) {
    return NextResponse.json({ error: "Invalid file hash" }, { status: 400 });
  }

  const fileName = (body.fileName || "receipt.jpg").trim();
  const ext = extFromName(fileName);
  const mime = (body.fileType || "").trim() || mimeForExt(ext);
  const key = `tradestack/${session.tenantId}/receipts/${fileSha}_receipt.${ext}`;

  const { data: existingFile } = await session.supabase
    .from("tenant_files")
    .select("id, public_url")
    .eq("tenant_id", session.tenantId)
    .eq("b2_key", key)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingFile) {
    const { count: receiptCount, error: countErr } = await session.supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenantId)
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
    const { error: orphanErr } = await session.supabase
      .from("tenant_files")
      .delete()
      .eq("id", existingFile.id)
      .eq("tenant_id", session.tenantId);
    if (orphanErr) {
      return NextResponse.json({ error: orphanErr.message }, { status: 500 });
    }
  }

  const uploadUrl = await presignB2PutObject({
    key,
    mimeType: mime,
    expiresInSeconds: 900,
  });
  return NextResponse.json({
    success: true,
    key,
    mimeType: mime,
    uploadUrl,
    publicUrl: publicUrlForB2Key(key),
  });
}

