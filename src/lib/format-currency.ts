const FALLBACK = "GBP";

/** ISO 4217 code for Intl (e.g. GBP → £). */
export function normalizeCurrencyCode(code: string | null | undefined): string {
  const c = (code || FALLBACK).trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) return c;
  return FALLBACK;
}

export function formatCurrency(
  amount: number,
  currencyCode: string | null | undefined,
): string {
  const code = normalizeCurrencyCode(currencyCode);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
