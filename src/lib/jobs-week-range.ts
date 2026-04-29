/** Local Monday–Sunday week containing `ref` (same idea as ISO week, Monday start). */

export function getMonday(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(ref: Date, days: number): Date {
  const d = new Date(ref);
  d.setDate(d.getDate() + days);
  return d;
}

export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for the Sunday ending the week that contains `ref`. */
export function getWeekEndDateKey(ref: Date = new Date()): string {
  const monday = getMonday(ref);
  const sunday = addDays(monday, 6);
  return toLocalISODate(sunday);
}

/**
 * Jobs with no onsite date, or onsite on/before this week’s Sunday, go in the
 * “this week” bucket. Jobs strictly after that Sunday are “future”.
 */
export function isFutureJob(dateOnsite: string | null | undefined, now = new Date()): boolean {
  if (dateOnsite == null || String(dateOnsite).trim() === "") {
    return false;
  }
  const raw = String(dateOnsite).split("T")[0] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return false;
  }
  const weekEnd = getWeekEndDateKey(now);
  return raw > weekEnd;
}
