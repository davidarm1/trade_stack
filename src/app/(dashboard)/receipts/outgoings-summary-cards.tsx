import { formatCurrency } from "@/lib/format-currency";

type OutgoingRow = {
  amount_total?: number | null;
  amount_tax?: number | null;
  due_date?: string | null;
  payment_date?: string | null;
  payment_status?: string | null;
};

function isPaid(status: string | null | undefined): boolean {
  return (status || "").trim().toLowerCase() === "paid";
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inCurrentMonth(d: Date, now: Date): boolean {
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

export function OutgoingsSummaryCards({
  rows,
  currencyCode,
}: {
  rows: OutgoingRow[];
  currencyCode?: string | null;
}) {
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  let toPay = 0;
  let overdue = 0;
  let paidThisMonth = 0;
  let vatTotal = 0;

  for (const row of rows) {
    const amount = typeof row.amount_total === "number" ? row.amount_total : 0;
    const vat = typeof row.amount_tax === "number" ? row.amount_tax : 0;
    vatTotal += vat;

    const paid = isPaid(row.payment_status);
    const dueDate = toDate(row.due_date);
    const dueDayUtc = dueDate
      ? new Date(
          Date.UTC(
            dueDate.getUTCFullYear(),
            dueDate.getUTCMonth(),
            dueDate.getUTCDate(),
          ),
        )
      : null;
    const isOverdue = !paid && !!dueDayUtc && dueDayUtc < todayUtc;

    if (!paid) {
      if (isOverdue) overdue += amount;
      else toPay += amount;
    }

    if (paid) {
      const paidDate = toDate(row.payment_date);
      if (paidDate && inCurrentMonth(paidDate, now)) {
        paidThisMonth += amount;
      }
    }
  }

  const cards = [
    {
      label: "To Pay",
      value: toPay,
      className: "border-orange-200 bg-orange-50 text-orange-900",
      labelClassName: "text-orange-700",
      prefix: "",
    },
    {
      label: "Overdue",
      value: overdue,
      className: "border-red-200 bg-red-50 text-red-900",
      labelClassName: "text-red-700",
      prefix: "⚠ ",
    },
    {
      label: "Paid This Month",
      value: paidThisMonth,
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
      labelClassName: "text-emerald-700",
      prefix: "",
    },
    {
      label: "VAT",
      value: vatTotal,
      className: "border-slate-200 bg-slate-50 text-slate-900",
      labelClassName: "text-slate-700",
      prefix: "",
    },
  ] as const;

  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border px-4 py-3 shadow-sm ${card.className}`}
        >
          <p className="text-2xl font-semibold tabular-nums">
            {formatCurrency(card.value, currencyCode)}
          </p>
          <p className={`mt-1 text-sm font-medium ${card.labelClassName}`}>
            {card.prefix}
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
}
