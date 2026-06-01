import { describe, expect, it } from "vitest";
import {
  computePeriodMetrics,
  londonLocalToUtc,
  londonMonthBounds,
  londonPartsOf,
  londonWeekDateKeys,
  TAX_RESERVE_RATE,
} from "./period-totals";

// ── timezone helpers ──────────────────────────────────────────────────────────

describe("londonLocalToUtc", () => {
  it("produces UTC midnight for GMT months (January)", () => {
    // London is UTC+0 in January
    const d = londonLocalToUtc(2026, 1, 1, 0, 0, 0);
    expect(d.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("produces UTC 23:00 prev day for BST months (May)", () => {
    // London is UTC+1 in May, so London midnight = UTC 23:00 prev day
    const d = londonLocalToUtc(2026, 5, 1, 0, 0, 0);
    expect(d.toISOString()).toBe("2026-04-30T23:00:00.000Z");
  });
});

describe("londonMonthBounds", () => {
  it("May 2026 start is UTC 2026-04-30T23:00:00Z (BST)", () => {
    const { start } = londonMonthBounds(2026, 5);
    expect(start.toISOString()).toBe("2026-04-30T23:00:00.000Z");
  });

  it("May 2026 end is UTC 2026-05-31T22:59:59Z (BST)", () => {
    const { end } = londonMonthBounds(2026, 5);
    expect(end.toISOString()).toBe("2026-05-31T22:59:59.000Z");
  });

  it("January 2026 start is UTC midnight (GMT)", () => {
    const { start } = londonMonthBounds(2026, 1);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("londonWeekDateKeys", () => {
  it("returns Monday–Sunday keys for a mid-week day", () => {
    // 2026-05-13 is a Wednesday
    const d = londonLocalToUtc(2026, 5, 13, 12, 0, 0);
    const { weekStartKey, weekEndKey } = londonWeekDateKeys(d);
    expect(weekStartKey).toBe("2026-05-11"); // Monday
    expect(weekEndKey).toBe("2026-05-17"); // Sunday
  });

  it("Sunday evening stays in the current week (not next week)", () => {
    // 2026-05-17 Sunday at 23:30 London time — should still be week 05-11..05-17
    const d = londonLocalToUtc(2026, 5, 17, 23, 30, 0);
    const { weekStartKey, weekEndKey } = londonWeekDateKeys(d);
    expect(weekStartKey).toBe("2026-05-11");
    expect(weekEndKey).toBe("2026-05-17");
  });

  it("Monday starts a new week", () => {
    // 2026-05-18 Monday at 00:01 London time → new week
    const d = londonLocalToUtc(2026, 5, 18, 0, 1, 0);
    const { weekStartKey, weekEndKey } = londonWeekDateKeys(d);
    expect(weekStartKey).toBe("2026-05-18");
    expect(weekEndKey).toBe("2026-05-24");
  });

  it("handles week crossing a month boundary", () => {
    // 2026-05-01 Friday → week is Mon 2026-04-27 to Sun 2026-05-03
    const d = londonLocalToUtc(2026, 5, 1, 10, 0, 0);
    const { weekStartKey, weekEndKey } = londonWeekDateKeys(d);
    expect(weekStartKey).toBe("2026-04-27");
    expect(weekEndKey).toBe("2026-05-03");
  });
});

describe("londonPartsOf", () => {
  it("extracts day of week correctly for a known date", () => {
    // 2026-05-13 is Wednesday (dow = 3)
    const d = londonLocalToUtc(2026, 5, 13, 12, 0, 0);
    const parts = londonPartsOf(d);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(5);
    expect(parts.day).toBe(13);
    expect(parts.dow).toBe(3); // Wednesday
  });
});

// ── computePeriodMetrics ──────────────────────────────────────────────────────

const NOW = londonLocalToUtc(2026, 5, 13, 10, 0, 0); // Wednesday 2026-05-13

function makeJob(overrides: Partial<{
  id: string;
  status: string;
  payment_status: string | null;
  payment_terms_days: number | null;
  subtotal: number;
  total_inc_vat: number | null;
  invoice_sent_at: string | null;
  invoice_paid_at: string | null;
  date_onsite: string | null;
}>) {
  return {
    id: overrides.id ?? "job-1",
    status: overrides.status ?? "completed",
    payment_status: overrides.payment_status ?? null,
    payment_terms_days: overrides.payment_terms_days ?? 30,
    subtotal: overrides.subtotal ?? 100,
    total_inc_vat: overrides.total_inc_vat ?? null,
    invoice_sent_at: overrides.invoice_sent_at ?? null,
    invoice_paid_at: overrides.invoice_paid_at ?? null,
    date_onsite: overrides.date_onsite ?? null,
  };
}

const BASE_INPUT = {
  receiptsTotal: 0,
  wagesPaid: 0,
  quotesRows: [],
  followups: [],
  year: 2026,
  month: 5,
  now: NOW,
};

describe("computePeriodMetrics — empty tenant", () => {
  it("returns all zeros for empty data", () => {
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs: [] });
    expect(m.incomeReceived).toBe(0);
    expect(m.invoicedAccrued).toBe(0);
    expect(m.taxReserve).toBe(0);
    expect(m.netProfit).toBe(0);
    expect(m.spendableThisMonth).toBe(0);
    expect(m.jobsThisWeek).toBe(0);
    expect(m.upcomingJobs).toBe(0);
    expect(m.overdueCount).toBe(0);
  });
});

describe("computePeriodMetrics — income is cash basis (paid, not invoiced)", () => {
  it("incomeReceived counts payment received in period, not invoice date", () => {
    const jobs = [
      // Invoiced this month, paid this month
      makeJob({
        id: "j1",
        status: "completed",
        subtotal: 500,
        invoice_sent_at: "2026-05-05T10:00:00Z",
        invoice_paid_at: "2026-05-10T10:00:00Z",
      }),
      // Invoiced this month, NOT yet paid
      makeJob({
        id: "j2",
        status: "completed",
        subtotal: 920,
        invoice_sent_at: "2026-05-08T10:00:00Z",
        invoice_paid_at: null,
      }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.incomeReceived).toBe(500);
    expect(m.invoicedAccrued).toBe(1420);
  });
});

describe("computePeriodMetrics — tax reserve is accrual basis", () => {
  it("taxReserve = invoicedAccrued * TAX_RESERVE_RATE", () => {
    const jobs = [
      makeJob({
        id: "j1",
        subtotal: 1000,
        invoice_sent_at: "2026-05-05T10:00:00Z",
        invoice_paid_at: null,
      }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.invoicedAccrued).toBe(1000);
    expect(m.taxReserve).toBe(1000 * TAX_RESERVE_RATE);
  });

  it("taxReserve is zero when nothing invoiced in period", () => {
    const jobs = [
      // Paid this month but invoiced in a previous month
      makeJob({
        id: "j1",
        subtotal: 500,
        invoice_sent_at: "2026-04-15T10:00:00Z",
        invoice_paid_at: "2026-05-02T10:00:00Z",
      }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.incomeReceived).toBe(500);
    expect(m.invoicedAccrued).toBe(0);
    expect(m.taxReserve).toBe(0);
  });
});

describe("computePeriodMetrics — spendable floors at 0", () => {
  it("spendableThisMonth is zero when taxReserve > netProfit", () => {
    const jobs = [
      makeJob({
        id: "j1",
        subtotal: 2000,
        invoice_sent_at: "2026-05-05T10:00:00Z",
        invoice_paid_at: "2026-05-06T10:00:00Z",
      }),
    ];
    // Net = 2000 income - 5000 outgoings = -3000, taxReserve = 400
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs, receiptsTotal: 5000 });
    expect(m.netProfit).toBe(-3000);
    expect(m.taxReserve).toBe(2000 * TAX_RESERVE_RATE); // 400
    expect(m.spendableThisMonth).toBe(0); // floored
  });
});

describe("computePeriodMetrics — jobs this week excludes undated jobs", () => {
  it("undated job is not in jobsThisWeek", () => {
    const jobs = [
      makeJob({ id: "j1", status: "open", date_onsite: null }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.jobsThisWeek).toBe(0);
    expect(m.upcomingJobs).toBe(0);
  });

  it("dated job in this week is counted", () => {
    const jobs = [
      // 2026-05-14 is Thursday in the same week as NOW (2026-05-13, Wednesday)
      makeJob({ id: "j1", status: "open", date_onsite: "2026-05-14" }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.jobsThisWeek).toBe(1);
    expect(m.upcomingJobs).toBe(0);
  });

  it("dated job after this Sunday is upcoming, not this week", () => {
    const jobs = [
      makeJob({ id: "j1", status: "open", date_onsite: "2026-05-18" }), // Monday next week
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.jobsThisWeek).toBe(0);
    expect(m.upcomingJobs).toBe(1);
  });
});

describe("computePeriodMetrics — pastDueJobs", () => {
  it("counts a job with date_onsite yesterday as past due", () => {
    const jobs = [
      // 2026-05-12 is the day before NOW (2026-05-13)
      makeJob({ id: "j1", status: "open", date_onsite: "2026-05-12" }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.pastDueJobs).toBe(1);
    expect(m.pastDueJobsValue).toBe(100);
  });

  it("does not count a job scheduled today", () => {
    const jobs = [
      makeJob({ id: "j1", status: "open", date_onsite: "2026-05-13" }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.pastDueJobs).toBe(0);
  });

  it("does not count a completed job even if past date", () => {
    const jobs = [
      makeJob({ id: "j1", status: "completed", date_onsite: "2026-05-01" }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.pastDueJobs).toBe(0);
  });

  it("does not count a cancelled job even if past date", () => {
    const jobs = [
      makeJob({ id: "j1", status: "cancelled", date_onsite: "2026-05-01" }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.pastDueJobs).toBe(0);
  });

  it("does not count an undated job", () => {
    const jobs = [
      makeJob({ id: "j1", status: "open", date_onsite: null }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.pastDueJobs).toBe(0);
  });

  it("sums pastDueJobsValue correctly for multiple past-due jobs", () => {
    const jobs = [
      makeJob({ id: "j1", status: "open", subtotal: 200, date_onsite: "2026-05-01" }),
      makeJob({ id: "j2", status: "in_progress", subtotal: 350, date_onsite: "2026-05-10" }),
      makeJob({ id: "j3", status: "scheduled", subtotal: 999, date_onsite: "2026-05-13" }), // today — not past
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.pastDueJobs).toBe(2);
    expect(m.pastDueJobsValue).toBe(550);
  });
});

describe("computePeriodMetrics — month boundary (May with BST)", () => {
  it("invoice paid at 2026-05-01T00:30:00Z is within May (London = 01:30 BST)", () => {
    // London midnight May 1 = UTC April 30 23:00; so 00:30Z May 1 = 01:30 London May 1 ✓
    const jobs = [
      makeJob({
        id: "j1",
        subtotal: 300,
        invoice_sent_at: "2026-05-01T00:30:00Z",
        invoice_paid_at: "2026-05-01T00:30:00Z",
      }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.incomeReceived).toBe(300);
    expect(m.invoicedAccrued).toBe(300);
  });

  it("invoice paid at 2026-04-30T22:59:59Z is NOT in May (London = 23:59 Apr 30)", () => {
    // UTC April 30 22:59Z = London April 30 23:59 — still April
    const jobs = [
      makeJob({
        id: "j1",
        subtotal: 300,
        invoice_paid_at: "2026-04-30T22:59:59Z",
        invoice_sent_at: "2026-04-30T22:59:59Z",
      }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.incomeReceived).toBe(0);
    expect(m.invoicedAccrued).toBe(0);
  });

  it("invoice paid at 2026-04-30T23:00:00Z IS in May (London midnight May 1)", () => {
    // UTC April 30 23:00Z = London May 1 00:00 (first moment of May)
    const jobs = [
      makeJob({
        id: "j1",
        subtotal: 300,
        invoice_paid_at: "2026-04-30T23:00:00Z",
        invoice_sent_at: "2026-04-30T23:00:00Z",
      }),
    ];
    const m = computePeriodMetrics({ ...BASE_INPUT, jobs });
    expect(m.incomeReceived).toBe(300);
    expect(m.invoicedAccrued).toBe(300);
  });
});
