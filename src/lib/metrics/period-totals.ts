import type { SupabaseClient } from "@supabase/supabase-js";
import {
  inOutstandingBucket,
  inOverdueBucket,
  inTodoBucket,
  jobAmount,
  sumJobAmounts,
  type JobPayFields,
} from "@/lib/jobs-payment-buckets";

const TZ = "Europe/London";
export const TAX_RESERVE_RATE = 0.2;

type ComputedMetrics = {
  // Cash flow (cash basis)
  incomeReceived: number;
  outgoings: number;
  wagesPaid: number;
  netProfit: number;

  // Accrual view (for tax)
  invoicedAccrued: number;
  taxReserve: number; // 20% of invoicedAccrued
  spendableThisMonth: number; // netProfit - taxReserve, floor 0

  // Work queue
  jobsThisWeek: number;
  upcomingJobs: number;
  overdueCount: number;
  overdueValue: number;
  readyToInvoice: number;
  awaitingPayment: number;
  awaitingPaymentValue: number;
  pendingQuotes: number;
  pendingQuotesValue: number;

  // Scheduling: past due (date_onsite < today, status not completed/cancelled)
  // Always relative to `now`, independent of the month param.
  pastDueJobs: number;
  pastDueJobsValue: number;

  // Contact log breakdown of overdue
  overdueNeedsFirstContact: { count: number; value: number };
  overduePromisedThisWeek: { count: number; value: number };
  overdueAwaitingReply: { count: number; value: number };
  overdueEscalated: { count: number; value: number };
};

export type PeriodMetrics = ComputedMetrics & { currencyCode: string | null };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Convert a Europe/London local datetime to a UTC Date.
 * Handles both GMT (UTC+0) and BST (UTC+1) correctly.
 */
export function londonLocalToUtc(
  year: number,
  month: number,
  day: number,
  h = 0,
  m = 0,
  s = 0,
): Date {
  const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  const naiveMs = new Date(iso + "Z").getTime();
  // Format that naive-UTC instant as London local time, then compute the offset
  const londonRepr = new Intl.DateTimeFormat("sv", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .format(new Date(naiveMs))
    .replace(" ", "T");
  const offset = naiveMs - new Date(londonRepr + "Z").getTime();
  return new Date(naiveMs + offset);
}

export function londonPartsOf(d: Date): {
  year: number;
  month: number;
  day: number;
  dow: number;
} {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    dow: dowMap[parts.weekday ?? ""] ?? 0,
  };
}

export function londonMonthBounds(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: londonLocalToUtc(year, month, 1, 0, 0, 0),
    end: londonLocalToUtc(year, month, lastDay, 23, 59, 59),
  };
}

/** Returns YYYY-MM-DD keys for Monday and Sunday of the week containing `now` (London TZ). */
export function londonWeekDateKeys(now: Date): {
  weekStartKey: string;
  weekEndKey: string;
} {
  const { year, month, day, dow } = londonPartsOf(now);
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  // Use Date.UTC with potentially out-of-range day values — JS normalises correctly
  const monDate = new Date(Date.UTC(year, month - 1, day + diffToMon));
  const sunDate = new Date(Date.UTC(year, month - 1, day + diffToMon + 6));
  const toKey = (d: Date) =>
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return { weekStartKey: toKey(monDate), weekEndKey: toKey(sunDate) };
}

// ── internal helpers ─────────────────────────────────────────────────────────

type JobRow = JobPayFields & {
  id: string;
  date_onsite?: string | null;
};

type FollowupRow = {
  job_id: string;
  status: string | null;
  next_action_date: string | null;
};

function tsInRange(iso: string | null | undefined, start: Date, end: Date): boolean {
  const raw = String(iso ?? "").trim();
  if (!raw) return false;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

function dateKeyInRange(
  v: string | null | undefined,
  startKey: string,
  endKey: string,
): boolean {
  const raw = String(v ?? "").split("T")[0] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  return raw >= startKey && raw <= endKey;
}

// ── pure computation (exported so tests can drive it directly) ───────────────

export type ComputeInput = {
  jobs: JobRow[];
  receiptsTotal: number;
  wagesPaid: number;
  quotesRows: { price?: number | null }[];
  followups: FollowupRow[];
  year: number;
  month: number;
  now: Date;
};

export function computePeriodMetrics({
  jobs,
  receiptsTotal,
  wagesPaid,
  quotesRows,
  followups,
  year,
  month,
  now,
}: ComputeInput): ComputedMetrics {
  const { start: monthStart, end: monthEnd } = londonMonthBounds(year, month);
  const { weekStartKey, weekEndKey } = londonWeekDateKeys(now);

  const { year: todayYear, month: todayMonth, day: todayDay } = londonPartsOf(now);
  const todayKey = `${todayYear}-${pad2(todayMonth)}-${pad2(todayDay)}`;

  const activeStatuses = new Set(["open", "in_progress", "scheduled"]);
  const workQueue = jobs.filter((j) =>
    activeStatuses.has(((j.status ?? "") as string).toLowerCase()),
  );

  const pastDueStatuses = new Set(["completed", "cancelled"]);
  const pastDueItems = jobs.filter((j) => {
    if (pastDueStatuses.has(((j.status ?? "") as string).toLowerCase())) return false;
    const raw = String(j.date_onsite ?? "").split("T")[0] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    return raw < todayKey;
  });

  // Undated jobs are excluded from time-based buckets
  const weekJobs = workQueue.filter((j) =>
    dateKeyInRange(j.date_onsite, weekStartKey, weekEndKey),
  );
  const futureJobs = workQueue.filter((j) => {
    const raw = String(j.date_onsite ?? "").split("T")[0] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    return raw > weekEndKey;
  });

  const todoJobs = jobs.filter((j) => inTodoBucket(j));
  const outstandingJobs = jobs.filter((j) => inOutstandingBucket(j));
  const overdueJobs = jobs.filter((j) => inOverdueBucket(j));

  const invoicedThisMonth = jobs.filter((j) =>
    tsInRange(j.invoice_sent_at, monthStart, monthEnd),
  );
  const paidThisMonth = jobs.filter((j) =>
    tsInRange(j.invoice_paid_at, monthStart, monthEnd),
  );

  const incomeReceived = sumJobAmounts(paidThisMonth);
  const invoicedAccrued = sumJobAmounts(invoicedThisMonth);
  const netProfit = incomeReceived - receiptsTotal - wagesPaid;
  const taxReserve = invoicedAccrued > 0 ? invoicedAccrued * TAX_RESERVE_RATE : 0;
  const spendableThisMonth = Math.max(0, netProfit - taxReserve);

  const pendingQuotes = quotesRows.length;
  const pendingQuotesValue = quotesRows.reduce(
    (s, r) => s + Number(r.price ?? 0),
    0,
  );

  // Overdue sub-buckets
  const followupMap = new Map<string, FollowupRow>();
  for (const f of followups) followupMap.set(f.job_id, f);

  const overdueNeedsFirstContact = { count: 0, value: 0 };
  const overduePromisedThisWeek = { count: 0, value: 0 };
  const overdueAwaitingReply = { count: 0, value: 0 };
  const overdueEscalated = { count: 0, value: 0 };

  for (const j of overdueJobs) {
    const f = followupMap.get(j.id) ?? null;
    const amt = jobAmount(j);

    if (!f) {
      overdueNeedsFirstContact.count++;
      overdueNeedsFirstContact.value += amt;
      continue;
    }

    const status = f.status ?? "chased";
    if (
      status === "promised_payment" &&
      f.next_action_date &&
      f.next_action_date >= weekStartKey &&
      f.next_action_date <= weekEndKey
    ) {
      overduePromisedThisWeek.count++;
      overduePromisedThisWeek.value += amt;
    } else if (status === "awaiting_reply") {
      overdueAwaitingReply.count++;
      overdueAwaitingReply.value += amt;
    } else if (status === "escalated") {
      overdueEscalated.count++;
      overdueEscalated.value += amt;
    }
    // "chased" / promised with out-of-range date → counted in total but not in sub-buckets
  }

  return {
    incomeReceived,
    outgoings: receiptsTotal,
    wagesPaid,
    netProfit,
    invoicedAccrued,
    taxReserve,
    spendableThisMonth,
    pastDueJobs: pastDueItems.length,
    pastDueJobsValue: sumJobAmounts(pastDueItems),
    jobsThisWeek: weekJobs.length,
    upcomingJobs: futureJobs.length,
    overdueCount: overdueJobs.length,
    overdueValue: sumJobAmounts(overdueJobs),
    readyToInvoice: todoJobs.length,
    awaitingPayment: outstandingJobs.length,
    awaitingPaymentValue: sumJobAmounts(outstandingJobs),
    pendingQuotes,
    pendingQuotesValue,
    overdueNeedsFirstContact,
    overduePromisedThisWeek,
    overdueAwaitingReply,
    overdueEscalated,
  };
}

// ── async fetcher ─────────────────────────────────────────────────────────────

const JOB_SELECT =
  "id,status,payment_status,payment_terms_days,subtotal,total_inc_vat,invoice_sent_at,invoice_paid_at,date_onsite,deleted_at";

export async function getPeriodMetrics(
  supabase: SupabaseClient,
  tenantId: string,
  { year, month }: { year: number; month: number },
  now = new Date(),
): Promise<PeriodMetrics> {
  const { start: monthStart, end: monthEnd } = londonMonthBounds(year, month);
  const monthStartDate = `${year}-${pad2(month)}-01`;
  const monthEndDate = new Date(year, month, 0).toISOString().slice(0, 10);

  const [jobsRes, receiptsRes, quotesRes, wagesRes, followupsRes, tenantRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(JOB_SELECT)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
    supabase
      .from("receipts")
      .select("amount_total, payment_status")
      .eq("tenant_id", tenantId)
      .is("parent_receipt_id", null)
      .eq("payment_status", "paid")
      .gte("invoice_date", monthStartDate)
      .lte("invoice_date", monthEndDate),
    supabase
      .from("quotes")
      .select("id, price")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .in("status", ["draft", "sent", "pending"]),
    supabase
      .from("wages")
      .select("total_wage")
      .eq("tenant_id", tenantId)
      .eq("approval_status", "approved")
      .gte("period_date", monthStartDate)
      .lte("period_date", monthEndDate),
    supabase
      .from("job_latest_followup")
      .select("job_id, status, next_action_date")
      .eq("tenant_id", tenantId),
    supabase.from("tenants").select("currency").eq("id", tenantId).maybeSingle(),
  ]);

  const jobs = (jobsRes.data ?? []) as JobRow[];
  const receiptsTotal = (receiptsRes.data ?? []).reduce(
    (s, r) => s + Number((r as { amount_total?: number | null }).amount_total ?? 0),
    0,
  );
  const wagesPaid = (wagesRes.data ?? []).reduce(
    (s, r) => s + Number((r as { total_wage?: number | null }).total_wage ?? 0),
    0,
  );
  const quotesRows = (quotesRes.data ?? []) as { price?: number | null }[];
  const followups = (followupsRes.data ?? []) as FollowupRow[];
  const currencyCode = (tenantRes.data?.currency as string | null) ?? null;

  return {
    currencyCode,
    ...computePeriodMetrics({ jobs, receiptsTotal, wagesPaid, quotesRows, followups, year, month, now }),
  };
}
