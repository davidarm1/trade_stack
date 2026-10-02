import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAiUsage } from "@/lib/ai-usage";
import { getSignedDownloadUrl } from "@/lib/b2";
import { normalizeB2ObjectKey } from "@/lib/b2-links";
import {
  baselineLineSumForReceipt,
  parseReceiptLineItems,
  recalculateAmountsFromLines,
} from "@/lib/receipt-line-items";

const SYSTEM = [
  "You are a receipt parser. Extract data from this receipt, invoice, or payment confirmation and return ONLY a JSON object with these fields: supplier_name, date (YYYY-MM-DD), total_amount (number), vat_amount (number or null), payment_status (paid or unpaid), description, currency (default GBP), items (array of line objects). Each line object may include: description, quantity, unit_price, total (line gross), net, tax.",
  "items must always contain at least one line. If the document shows multiple product/service lines, return one line per product/service. If it shows only a single charge, return one line whose description says what was paid for and whose total equals total_amount.",
  "The image may be a banking app or bank statement screenshot (Direct Debit, standing order, card payment, bank transfer) rather than a till receipt. In that case: supplier_name is the payee/merchant (e.g. 'DVLA'), date is the transaction date, total_amount is the payment amount as a positive number (ignore the minus sign and ignore 'balance after transaction'), payment_status is paid, vat_amount is null unless VAT is explicitly shown, and description combines the payment type with the payee and any reference (e.g. 'Direct Debit - DVLA vehicle tax, ref OU16DCO'). Do not treat payee account numbers or balances as amounts.",
  "Return null for any field you cannot determine. Return JSON only, no markdown, no explanation.",
].join(" ");

export type PaymentStatusSelection =
  | "paid"
  | "due_7"
  | "due_14"
  | "due_28"
  | "due_30";

export type ReceiptOcrResult = {
  scanConfidence: "high" | "low" | "failed";
  lineItemCount: number;
  updated: boolean;
};

type Parsed = {
  supplier_name: string | null;
  date: string | null;
  total_amount: number | null;
  vat_amount: number | null;
  payment_status: "paid" | "unpaid" | null;
  description: string | null;
  currency: string | null;
  items: unknown[] | null;
};

const EMPTY_PARSED: Parsed = {
  supplier_name: null,
  date: null,
  total_amount: null,
  vat_amount: null,
  payment_status: null,
  description: null,
  currency: "GBP",
  items: null,
};

function coercePaymentStatus(raw: unknown): "paid" | "unpaid" | null {
  if (typeof raw !== "string") return null;
  const status = raw.trim().toLowerCase();
  if (status === "paid") return "paid";
  if (status === "unpaid") return "unpaid";
  return null;
}

export function parseRequestedPaymentStatus(raw: unknown): PaymentStatusSelection {
  if (typeof raw !== "string") return "paid";
  const status = raw.trim().toLowerCase();
  if (
    status === "paid" ||
    status === "due_7" ||
    status === "due_14" ||
    status === "due_28" ||
    status === "due_30"
  ) {
    return status;
  }
  return "paid";
}

export function paymentStatusForSelection(
  selection: PaymentStatusSelection,
): "paid" | "unpaid" {
  return selection === "paid" ? "paid" : "unpaid";
}

function dueDaysForSelection(selection: PaymentStatusSelection): number | null {
  if (selection === "due_7") return 7;
  if (selection === "due_14") return 14;
  if (selection === "due_28") return 28;
  if (selection === "due_30") return 30;
  return null;
}

function isoDateOrToday(raw: string | null | undefined): string {
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function addDaysUtc(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolveReceiptPaymentFields(args: {
  selection: PaymentStatusSelection;
  invoiceDate?: string | null;
}): { payment_status: "paid" | "unpaid"; due_date: string | null } {
  const payment_status = paymentStatusForSelection(args.selection);
  const dueDays = dueDaysForSelection(args.selection);
  if (payment_status === "paid" || dueDays == null) {
    return { payment_status, due_date: null };
  }
  const base = isoDateOrToday(args.invoiceDate);
  return { payment_status, due_date: addDaysUtc(base, dueDays) };
}

export function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "bin";
  return (
    name
      .slice(i + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin"
  );
}

export function mimeForExt(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export type StoredReceiptFile = {
  key: string;
  url: string;
  buf: Buffer;
  mime: string;
  fileName: string;
  isPdf: boolean;
};

/** Downloads a receipt's stored file, refusing keys outside the tenant's own folder. */
export async function loadStoredReceiptFile(args: {
  receiptUrl: string | null | undefined;
  tenantId: string;
}): Promise<StoredReceiptFile | null> {
  const key = normalizeB2ObjectKey(args.receiptUrl);
  if (!key || !key.startsWith(`tradestack/${args.tenantId}/`)) return null;

  const url = await getSignedDownloadUrl(key);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Receipt file download failed: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const fileName = key.split("/").pop() || "receipt";
  const ext = extFromName(fileName);
  const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
  const mime =
    headerMime && headerMime !== "application/octet-stream" ? headerMime : mimeForExt(ext);
  return {
    key,
    url,
    buf,
    mime,
    fileName,
    isPdf: ext === "pdf" || mime === "application/pdf",
  };
}

/**
 * Runs AI extraction on a stored receipt file and writes the result to the receipt row.
 * When `requestedPaymentStatus` is omitted (rescans), payment status and due date are left as-is.
 */
export async function runReceiptOcr(args: {
  supabase: SupabaseClient;
  receiptId: string;
  tenantId: string;
  buf: Buffer;
  mime: string;
  fileName: string;
  isPdf: boolean;
  url: string;
  requestedPaymentStatus?: PaymentStatusSelection;
}): Promise<ReceiptOcrResult> {
  const {
    supabase,
    receiptId,
    tenantId,
    buf,
    mime,
    fileName,
    isPdf,
    url,
    requestedPaymentStatus,
  } = args;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[scan-receipt] OPENAI_API_KEY missing");
    return { scanConfidence: "failed", lineItemCount: 0, updated: false };
  }

  const openai = new OpenAI({ apiKey });
  const model = "gpt-4o-mini";

  console.log("[scan-receipt] OCR starting", {
    receiptId,
    tenantId,
    fileName,
    mime,
    isPdf,
    requestedPaymentStatus: requestedPaymentStatus ?? "preserve",
  });

  let parsed: Parsed = { ...EMPTY_PARSED };
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
                text: "Extract structured data from this receipt, invoice, or payment screenshot.",
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
          typeof obj.total_amount === "number" ? Math.abs(obj.total_amount) : null,
        vat_amount: typeof obj.vat_amount === "number" ? obj.vat_amount : null,
        description:
          typeof obj.description === "string" ? obj.description : null,
        currency: typeof obj.currency === "string" ? obj.currency : "GBP",
        payment_status: coercePaymentStatus(obj.payment_status),
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
      parsed = { ...EMPTY_PARSED };
      scanConfidence = "failed";
    }
  }

  // Metering failure is logged inside recordAiUsage; do not fail the receipt scan.
  await recordAiUsage({
    supabase,
    tenantId,
    feature: "receipt_scan",
    model,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
    logLabel: "[scan-receipt]",
  });

  if (!requestedPaymentStatus && scanConfidence !== "high") {
    return { scanConfidence, lineItemCount: 0, updated: false };
  }

  const aiConfidence =
    scanConfidence === "high" ? 0.9 : scanConfidence === "low" ? 0.45 : null;

  const notesFromOcr =
    typeof parsed.description === "string" && parsed.description.trim()
      ? parsed.description.trim()
      : null;

  let lineItemsNormalized = parseReceiptLineItems(parsed.items ?? []);
  if (lineItemsNormalized.length === 0 && parsed.total_amount != null) {
    lineItemsNormalized = [
      {
        description:
          parsed.description?.trim() || parsed.supplier_name?.trim() || "Payment",
        qty: 1,
        price: parsed.total_amount,
        total: parsed.total_amount,
        net:
          parsed.vat_amount != null ? parsed.total_amount - parsed.vat_amount : null,
        tax: parsed.vat_amount,
      },
    ];
  }
  const baseline = {
    lineSum: baselineLineSumForReceipt({
      line_items: lineItemsNormalized,
      amount_total: parsed.total_amount,
    }),
    amount_tax: parsed.vat_amount,
    amount_net:
      parsed.total_amount != null && parsed.vat_amount != null
        ? parsed.total_amount - parsed.vat_amount
        : null,
    amount_total: parsed.total_amount,
  };
  const amountsFromLines =
    lineItemsNormalized.length > 0
      ? recalculateAmountsFromLines(lineItemsNormalized, baseline)
      : null;

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("receipts")
    .update({
      supplier_name: parsed.supplier_name,
      invoice_date: parsed.date,
      amount_total: amountsFromLines?.amount_total ?? parsed.total_amount,
      amount_tax: amountsFromLines?.amount_tax ?? parsed.vat_amount,
      amount_net:
        amountsFromLines?.amount_net ??
        (parsed.total_amount != null && parsed.vat_amount != null
          ? parsed.total_amount - parsed.vat_amount
          : null),
      line_items: lineItemsNormalized,
      notes: notesFromOcr,
      currency: parsed.currency ?? "GBP",
      ...(requestedPaymentStatus
        ? resolveReceiptPaymentFields({
            selection: requestedPaymentStatus,
            invoiceDate: parsed.date,
          })
        : {}),
      processed_by_ai: true,
      ai_processed_at: now,
      ai_confidence: aiConfidence,
      updated_at: now,
    })
    .eq("id", receiptId)
    .eq("tenant_id", tenantId);

  if (updateErr) {
    console.error("[scan-receipt] receipt OCR update failed:", updateErr.message);
    return { scanConfidence, lineItemCount: lineItemsNormalized.length, updated: false };
  }

  console.log("[scan-receipt] receipt OCR update complete", {
    receiptId,
    scanConfidence,
    supplierName: parsed.supplier_name,
    totalAmount: parsed.total_amount,
  });
  return { scanConfidence, lineItemCount: lineItemsNormalized.length, updated: true };
}
