import { NextResponse } from "next/server";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { loadStoredReceiptFile } from "@/lib/receipt-ocr";
import { sendInvoiceEmail } from "@/lib/resend";

export const runtime = "nodejs";

const DEFAULT_HELPDESK_EMAIL = "david@davidarm.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;
  if (session.role !== "owner" && session.role !== "office") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }
  const { receiptId } = await params;

  const [{ data: receipt, error: loadErr }, { data: tenant }, { data: authData }] =
    await Promise.all([
      session.supabase
        .from("receipts")
        .select(
          "id, receipt_url, supplier_name, invoice_date, amount_total, line_items, ai_processed_at, created_at",
        )
        .eq("id", receiptId)
        .eq("tenant_id", session.tenantId)
        .maybeSingle(),
      session.supabase
        .from("tenants")
        .select("name, slug")
        .eq("id", session.tenantId)
        .maybeSingle(),
      session.supabase.auth.getUser(),
    ]);
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
    console.error("[report-receipt] file download failed:", e);
    file = null;
  }

  const reporterEmail = authData?.user?.email ?? "unknown";
  const tenantLabel = tenant?.name
    ? `${tenant.name}${tenant.slug ? ` (${tenant.slug})` : ""}`
    : session.tenantId;
  const details: Array<[string, string]> = [
    ["Company", tenantLabel],
    ["Tenant ID", session.tenantId],
    ["Reported by", reporterEmail],
    ["Receipt ID", receipt.id],
    ["Supplier (as scanned)", receipt.supplier_name ?? "—"],
    ["Date (as scanned)", receipt.invoice_date ?? "—"],
    ["Total (as scanned)", receipt.amount_total != null ? String(receipt.amount_total) : "—"],
    ["Line items (as scanned)", JSON.stringify(receipt.line_items ?? null)],
    ["Last AI scan", receipt.ai_processed_at ?? "never"],
    ["Uploaded", receipt.created_at ?? "—"],
    ["Storage key", file?.key ?? receipt.receipt_url ?? "—"],
    ["File attached", file ? "yes" : "no (download failed)"],
  ];

  const subject = `Receipt not recognised - ${tenant?.name ?? session.tenantId}`;
  const text = [
    "A user reported a receipt the AI could not read.",
    "",
    ...details.map(([k, v]) => `${k}: ${v}`),
  ].join("\n");
  const html = `<p>A user reported a receipt the AI could not read.</p><table cellpadding="4" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${details
    .map(
      ([k, v]) =>
        `<tr><td style="color:#64748b;vertical-align:top">${escapeHtml(k)}</td><td><code>${escapeHtml(v)}</code></td></tr>`,
    )
    .join("")}</table>`;

  try {
    await sendInvoiceEmail({
      to: [process.env.HELPDESK_EMAIL?.trim() || DEFAULT_HELPDESK_EMAIL],
      subject,
      text,
      html,
      fromName: "Trade Stack Helpdesk",
      replyTo: authData?.user?.email ?? undefined,
      attachments: file
        ? [{ filename: file.fileName, content: file.buf, contentType: file.mime }]
        : undefined,
    });
  } catch (e) {
    console.error("[report-receipt] email failed:", e);
    return NextResponse.json({ error: "Could not send to the helpdesk" }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
