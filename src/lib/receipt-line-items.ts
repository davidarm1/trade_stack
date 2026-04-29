/**
 * Receipt line items stored as JSON on `receipts.line_items` (array of objects).
 * Used for bookkeeper review, VAT adjustments, and future accounting exports.
 */

export type ReceiptLineItemJson = {
  description: string;
  qty?: number | null;
  price?: number | null;
  total?: number | null;
  net?: number | null;
  tax?: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeDescription(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return "";
}

/** Parse JSON / loose shapes from OCR or legacy blobs into a normalized array. */
export function parseReceiptLineItems(raw: unknown): ReceiptLineItemJson[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value) && value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    value =
      obj.items ??
      obj.line_items ??
      obj.lineItems ??
      obj.rows ??
      obj.table ??
      obj.data;
  }
  if (!Array.isArray(value)) return [];

  const out: ReceiptLineItemJson[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const descriptionValue =
      obj.description ?? obj.name ?? obj.title ?? obj.item ?? "";
    const description = normalizeDescription(descriptionValue) || "—";
    out.push({
      description,
      qty: asNumber(obj.qty ?? obj.quantity),
      price: asNumber(obj.price ?? obj.unit_price ?? obj.unitPrice),
      total: asNumber(obj.total ?? obj.line_total ?? obj.amount),
      net: asNumber(obj.net ?? obj.amount_net),
      tax: asNumber(obj.tax ?? obj.vat ?? obj.vat_amount),
    });
  }
  return out;
}

export function sumLineTotals(lines: ReceiptLineItemJson[]): number {
  return round2(
    lines.reduce(
      (s, l) =>
        s +
        (typeof l.total === "number" && Number.isFinite(l.total) ? l.total : 0),
      0,
    ),
  );
}

export function sumLineTax(lines: ReceiptLineItemJson[]): number {
  return round2(
    lines.reduce(
      (s, l) =>
        s + (typeof l.tax === "number" && Number.isFinite(l.tax) ? l.tax : 0),
      0,
    ),
  );
}

export function sumLineNet(lines: ReceiptLineItemJson[]): number {
  return round2(
    lines.reduce(
      (s, l) =>
        s + (typeof l.net === "number" && Number.isFinite(l.net) ? l.net : 0),
      0,
    ),
  );
}

export type ReceiptAmountBaseline = {
  /** Denominator for proportional VAT when lines lack per-line tax */
  lineSum: number;
  amount_tax: number | null;
  amount_net: number | null;
  amount_total: number | null;
};

export function baselineLineSumForReceipt(args: {
  line_items: unknown;
  amount_total: number | null;
}): number {
  const fromLines = sumLineTotals(parseReceiptLineItems(args.line_items));
  if (fromLines > 0) return fromLines;
  if (
    typeof args.amount_total === "number" &&
    Number.isFinite(args.amount_total) &&
    args.amount_total > 0
  ) {
    return args.amount_total;
  }
  return 0;
}

/**
 * After line rows change (e.g. bookkeeper removes non-deductible lines), derive
 * header amounts. Prefer per-line net/tax when every row has them; otherwise scale
 * document VAT proportionally by line gross.
 */
export function recalculateAmountsFromLines(
  lines: ReceiptLineItemJson[],
  baseline: ReceiptAmountBaseline,
): { amount_total: number | null; amount_tax: number | null; amount_net: number | null } {
  if (lines.length === 0) {
    return { amount_total: null, amount_tax: null, amount_net: null };
  }

  const lineGross = sumLineTotals(lines);
  const allHaveTax = lines.every(
    (l) => typeof l.tax === "number" && Number.isFinite(l.tax),
  );
  const allHaveNet = lines.every(
    (l) => typeof l.net === "number" && Number.isFinite(l.net),
  );

  if (allHaveTax && allHaveNet) {
    const net = sumLineNet(lines);
    const tax = sumLineTax(lines);
    return {
      amount_total: round2(net + tax),
      amount_tax: tax,
      amount_net: net,
    };
  }

  if (allHaveTax) {
    const tax = sumLineTax(lines);
    const gross = lineGross > 0 ? lineGross : round2(tax);
    return {
      amount_total: gross,
      amount_tax: tax,
      amount_net: round2(gross - tax),
    };
  }

  const base = baseline.lineSum;
  const baseTax = baseline.amount_tax;

  if (
    base > 0 &&
    baseTax != null &&
    Number.isFinite(baseTax) &&
    lineGross > 0
  ) {
    const newTax = round2(baseTax * (lineGross / base));
    return {
      amount_total: lineGross,
      amount_tax: newTax,
      amount_net: round2(lineGross - newTax),
    };
  }

  return {
    amount_total: lineGross,
    amount_tax: null,
    amount_net: null,
  };
}
