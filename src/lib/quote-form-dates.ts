/** Default validity from quote date (new / edit quote forms). */
export const QUOTES_VALID_DAYS = 30;

export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysToLocalIsoDate(iso: string, days: number): string {
  const parts = iso.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return "";
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localIsoDate(dt);
}

export function entryDayQuotePeriod(): { quoteDate: string; expiresAt: string } {
  const q = localIsoDate(new Date());
  return { quoteDate: q, expiresAt: addDaysToLocalIsoDate(q, QUOTES_VALID_DAYS) };
}

/** `type="date"` value from DB timestamptz / date string. */
export function isoDateInputFromDb(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return localIsoDate(d);
}
