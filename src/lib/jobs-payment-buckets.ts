/** URL / filter value for jobs tabs. */
export type PayTab = "work" | "todo" | "outstanding" | "overdue";

export type JobPayFields = {
  invoice_sent_at?: string | null;
  invoice_paid_at?: string | null;
  status?: string | null;
  payment_status?: string | null;
  payment_terms_days?: number | null;
  total_inc_vat?: number | null;
  subtotal?: number | null;
};
type BillingBucket = "todo" | "outstanding" | "overdue" | null;

export function isPaid(j: JobPayFields): boolean {
  return j.invoice_paid_at != null && String(j.invoice_paid_at).trim() !== "";
}

export function jobAmount(j: JobPayFields): number {
  const n = j.total_inc_vat ?? j.subtotal;
  if (n == null || Number.isNaN(Number(n))) return 0;
  return Number(n);
}

export function parsePayTab(v: string | undefined): PayTab {
  if (v === "work") return "work";
  if (v === "outstanding" || v === "overdue") return v;
  if (v === "todo") return "todo";
  // Legacy ?pay=all or missing → default to work queue
  return "work";
}

/** Jobs still in billing pipeline (excludes paid). */
export function inTodoBucket(j: JobPayFields): boolean {
  return classifyBillingBucket(j) === "todo";
}

export function inOverdueBucket(j: JobPayFields): boolean {
  return classifyBillingBucket(j) === "overdue";
}

function classifyBillingBucket(j: JobPayFields): BillingBucket {
  if (isPaid(j)) return null;
  const payment = (j.payment_status ?? "").toLowerCase();
  if (payment === "overdue") return "overdue";

  const sentAtRaw = String(j.invoice_sent_at ?? "").trim();
  if (!sentAtRaw) {
    return (j.status ?? "").toLowerCase() === "completed" ? "todo" : null;
  }

  const sentAtMs = Date.parse(sentAtRaw);
  if (!Number.isFinite(sentAtMs)) return "outstanding";

  const terms =
    j.payment_terms_days == null || Number.isNaN(Number(j.payment_terms_days))
      ? 30
      : Number(j.payment_terms_days);

  const dueMs = invoiceDueMsFromSentAt(sentAtMs, terms);
  return Date.now() > dueMs ? "overdue" : "outstanding";
}

export function inOutstandingBucket(j: JobPayFields): boolean {
  return classifyBillingBucket(j) === "outstanding";
}

export function matchesPayTab(j: JobPayFields, pay: PayTab): boolean {
  if (pay === "work") return false;
  if (pay === "todo") return inTodoBucket(j);
  if (pay === "overdue") return inOverdueBucket(j);
  return inOutstandingBucket(j);
}

export function sumJobAmounts(jobs: JobPayFields[]): number {
  return jobs.reduce((s, j) => s + jobAmount(j), 0);
}

/** Same default as `classifyBillingBucket` when job terms are unset. */
export function paymentTermsDaysOrDefault(j: JobPayFields): number {
  const terms =
    j.payment_terms_days == null || Number.isNaN(Number(j.payment_terms_days))
      ? 30
      : Number(j.payment_terms_days);
  return terms;
}

/**
 * Whole calendar days from the invoice-sent date to today (local midnight),
 * floored at zero.
 */
export function daysFromInvoiceSent(
  invoiceSentAt: string | null | undefined,
): number | null {
  const raw = String(invoiceSentAt ?? "").trim();
  if (!raw) return null;
  const sent = new Date(raw);
  if (Number.isNaN(sent.getTime())) return null;
  const today = new Date();
  const sentDay = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate());
  const todayDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const diff = Math.round(
    (todayDay.getTime() - sentDay.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.max(0, diff);
}

/** Due instant: sent-at + N×24h, aligned with `classifyBillingBucket`. */
export function invoiceDueMsFromSentAt(
  sentAtMs: number,
  paymentTermsDays: number,
): number {
  return sentAtMs + paymentTermsDays * 24 * 60 * 60 * 1000;
}

/**
 * Due instant from stored invoice-sent ISO string and agreed terms, or null if
 * sent time is missing or invalid.
 */
export function invoiceDueMs(
  invoiceSentAt: string | null | undefined,
  paymentTermsDays: number,
): number | null {
  const raw = String(invoiceSentAt ?? "").trim();
  if (!raw) return null;
  const sentAtMs = Date.parse(raw);
  if (!Number.isFinite(sentAtMs)) return null;
  return invoiceDueMsFromSentAt(sentAtMs, paymentTermsDays);
}

/**
 * Calendar days from today (local) to the due date (local calendar day of the
 * due instant). Negative when overdue.
 */
export function calendarDaysToInvoiceDue(dueMs: number): number {
  const due = new Date(dueMs);
  const today = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return Math.round(
    (dueDay.getTime() - todayDay.getTime()) / (24 * 60 * 60 * 1000),
  );
}
