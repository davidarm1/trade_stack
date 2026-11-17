/** VAT handling for the Receipts CSV exports (kept pure so it can be unit tested). */

/** A company counts as VAT registered when it has a VAT number (same rule as invoices). */
export function isVatRegistered(vatNumber: string | null | undefined): boolean {
  return Boolean(String(vatNumber ?? "").trim());
}

type AmountRow = {
  amount_total?: number | null;
  amount_net?: number | null;
  amount_tax?: number | null;
};

/**
 * The money columns of a Xero bill line.
 * With VAT: net amount + tax amount, tax type 20% only when the receipt has VAT.
 * Without VAT: the gross total, no tax amount, tax type "No VAT".
 */
export function xeroAmountFields(
  row: AmountRow,
  includeVat: boolean,
): { unitAmount: number | null; taxType: string; taxAmount: number | null } {
  const tax = Number(row.amount_tax ?? 0);
  if (!includeVat) {
    return {
      unitAmount: row.amount_total ?? row.amount_net ?? null,
      taxType: "No VAT",
      taxAmount: null,
    };
  }
  return {
    unitAmount: row.amount_net ?? row.amount_total ?? null,
    taxType: tax > 0 ? "20% (VAT on Expenses)" : "No VAT",
    taxAmount: row.amount_tax ?? null,
  };
}

/** File name suffix so a no-VAT export can't be mistaken for a VAT one. */
export function vatFileSuffix(includeVat: boolean): string {
  return includeVat ? "" : "-novat";
}
