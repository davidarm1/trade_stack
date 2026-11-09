/** Currencies Stripe treats as having no minor unit (amount is whole units). */
const ZERO_DECIMAL = new Set(["JPY", "HUF"]);

/**
 * Convert a major-unit amount (e.g. pounds) to Stripe's minor units (pence).
 * Returns null for amounts that are not a positive finite number.
 */
export function toMinorUnits(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): number | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const factor = ZERO_DECIMAL.has(String(currency ?? "GBP").toUpperCase()) ? 1 : 100;
  const minor = Math.round(n * factor);
  return minor > 0 ? minor : null;
}

/** Pay links use a UUID token; reject anything else before touching the database. */
export function isPayToken(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function formatMinor(minor: number, currency: string): string {
  const upper = currency.toUpperCase();
  const factor = ZERO_DECIMAL.has(upper) ? 1 : 100;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: upper }).format(
    minor / factor,
  );
}
