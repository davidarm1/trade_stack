import { NextResponse } from "next/server";
import { getSessionTenantOrError } from "@/lib/api-auth";
import {
  deleteFromB2ByKey,
  receiptB2KeyFromPublicUrl,
} from "@/lib/b2";
import {
  baselineLineSumForReceipt,
  parseReceiptLineItems,
  recalculateAmountsFromLines,
} from "@/lib/receipt-line-items";

export const runtime = "nodejs";

type PatchBody = {
  supplier_name?: string | null;
  invoice_date?: string | null;
  amount_total?: number | null;
  amount_net?: number | null;
  amount_tax?: number | null;
  category?: string | null;
  payment_status?: string | null;
  notes?: string | null;
  /** JSON array; when set, net/tax/total are recalculated from lines + existing row. */
  line_items?: unknown;
};

function insufficientPermissions() {
  return NextResponse.json(
    { error: "Insufficient permissions" },
    { status: 403 },
  );
}

function canManageReceipts(role: string | null): boolean {
  return role === "owner" || role === "office";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;
  if (!canManageReceipts(session.role)) return insufficientPermissions();
  const { receiptId } = await params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await session.supabase
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const updatePayload: Record<string, unknown> = {
    supplier_name:
      typeof body.supplier_name === "string"
        ? body.supplier_name.trim() || null
        : body.supplier_name ?? existing.supplier_name,
    invoice_date:
      typeof body.invoice_date === "string"
        ? body.invoice_date.trim() || null
        : body.invoice_date ?? existing.invoice_date,
    category:
      typeof body.category === "string"
        ? body.category.trim() || null
        : body.category ?? existing.category,
    payment_status:
      typeof body.payment_status === "string"
        ? body.payment_status.trim() || null
        : body.payment_status ?? existing.payment_status,
    notes:
      typeof body.notes === "string"
        ? body.notes.trim() || null
        : body.notes ?? existing.notes,
    updated_at: new Date().toISOString(),
  };

  if (body.line_items !== undefined) {
    const normalized = parseReceiptLineItems(body.line_items);
    const baseline = {
      lineSum: baselineLineSumForReceipt({
        line_items: existing.line_items,
        amount_total: existing.amount_total,
      }),
      amount_tax: existing.amount_tax,
      amount_net: existing.amount_net,
      amount_total: existing.amount_total,
    };
    const amounts = recalculateAmountsFromLines(normalized, baseline);
    updatePayload.line_items = normalized;
    updatePayload.amount_total = amounts.amount_total;
    updatePayload.amount_tax = amounts.amount_tax;
    updatePayload.amount_net = amounts.amount_net;
  } else {
    if (typeof body.amount_total === "number") {
      updatePayload.amount_total = body.amount_total;
    } else if (body.amount_total === null) {
      updatePayload.amount_total = null;
    }
    if (typeof body.amount_net === "number") {
      updatePayload.amount_net = body.amount_net;
    } else if (body.amount_net === null) {
      updatePayload.amount_net = null;
    }
    if (typeof body.amount_tax === "number") {
      updatePayload.amount_tax = body.amount_tax;
    } else if (body.amount_tax === null) {
      updatePayload.amount_tax = null;
    }
  }

  const { data, error } = await session.supabase
    .from("receipts")
    .update(updatePayload)
    .eq("id", receiptId)
    .eq("tenant_id", session.tenantId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ receipt: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const session = await getSessionTenantOrError();
  if (!session.ok) return session.response;
  if (!canManageReceipts(session.role)) return insufficientPermissions();
  const { receiptId } = await params;

  const { data: receipt, error: receiptErr } = await session.supabase
    .from("receipts")
    .select("id, receipt_url")
    .eq("id", receiptId)
    .eq("tenant_id", session.tenantId)
    .maybeSingle();

  if (receiptErr) {
    return NextResponse.json({ error: receiptErr.message }, { status: 500 });
  }
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  if (receipt.receipt_url) {
    let fileMeta: { id: string; b2_key: string } | null = null;
    const { data: byUrl, error: metaErr } = await session.supabase
      .from("tenant_files")
      .select("id, b2_key")
      .eq("tenant_id", session.tenantId)
      .eq("public_url", receipt.receipt_url)
      .is("deleted_at", null)
      .maybeSingle();

    if (metaErr) {
      return NextResponse.json({ error: metaErr.message }, { status: 500 });
    }
    fileMeta = byUrl;

    if (!fileMeta?.b2_key) {
      const key = receiptB2KeyFromPublicUrl(receipt.receipt_url);
      if (key) {
        const { data: byKey, error: byKeyErr } = await session.supabase
          .from("tenant_files")
          .select("id, b2_key")
          .eq("tenant_id", session.tenantId)
          .eq("b2_key", key)
          .is("deleted_at", null)
          .maybeSingle();
        if (byKeyErr) {
          return NextResponse.json({ error: byKeyErr.message }, { status: 500 });
        }
        fileMeta = byKey;
      }
    }

    const b2Key =
      fileMeta?.b2_key ?? receiptB2KeyFromPublicUrl(receipt.receipt_url);

    if (b2Key) {
      try {
        await deleteFromB2ByKey(b2Key);
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? `Failed to delete cloud file: ${e.message}`
                : "Failed to delete cloud file",
          },
          { status: 500 },
        );
      }
    }

    if (fileMeta?.id) {
      const { error: metaDeleteErr } = await session.supabase
        .from("tenant_files")
        .delete()
        .eq("id", fileMeta.id)
        .eq("tenant_id", session.tenantId);
      if (metaDeleteErr) {
        return NextResponse.json(
          { error: metaDeleteErr.message },
          { status: 500 },
        );
      }
    }
  }

  const { error } = await session.supabase
    .from("receipts")
    .delete()
    .eq("id", receiptId)
    .eq("tenant_id", session.tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
