import { NextResponse } from "next/server";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadStoredReceiptFile, runReceiptOcr } from "@/lib/receipt-ocr";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;
  if (session.role !== "owner" && session.role !== "office") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }
  const { receiptId } = await params;

  const { data: receipt, error: loadErr } = await session.supabase
    .from("receipts")
    .select("id, receipt_url")
    .eq("id", receiptId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  let file;
  try {
    file = await loadStoredReceiptFile({
      receiptUrl: receipt.receipt_url,
      tenantId: session.tenantId,
    });
  } catch (e) {
    console.error("[rescan-receipt] file download failed:", e);
    return NextResponse.json({ error: "Could not download the receipt file" }, { status: 502 });
  }
  if (!file) {
    return NextResponse.json({ error: "This outgoing has no stored file to scan" }, { status: 400 });
  }

  const result = await runReceiptOcr({
    supabase: createServiceRoleClient(),
    receiptId: receipt.id,
    tenantId: session.tenantId,
    buf: file.buf,
    mime: file.mime,
    fileName: file.fileName,
    isPdf: file.isPdf,
    url: file.url,
  });

  if (!result.updated || result.lineItemCount === 0) {
    return NextResponse.json(
      {
        recognised: false,
        error: "The AI still couldn't read this file. You can send it to the helpdesk instead.",
      },
      { status: 422 },
    );
  }
  return NextResponse.json({ recognised: true, lineItemCount: result.lineItemCount });
}
