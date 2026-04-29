import { formatCurrency } from "@/lib/format-currency";

type OutgoingRow = {
  amount_total?: number | null;
  due_date?: string | null;
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

export function OutgoingsDueSoonAlert({
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
  const sevenDaysUtc = new Date(todayUtc);
  sevenDaysUtc.setUTCDate(todayUtc.getUTCDate() + 7);

  let dueSoon = 0;
  for (const row of rows) {
    if (isPaid(row.payment_status)) continue;
    const dueDate = toDate(row.due_date);
    if (!dueDate) continue;
    const dueDayUtc = new Date(
      Date.UTC(
        dueDate.getUTCFullYear(),
        dueDate.getUTCMonth(),
        dueDate.getUTCDate(),
      ),
    );
    if (dueDayUtc < todayUtc || dueDayUtc > sevenDaysUtc) continue;
    dueSoon += typeof row.amount_total === "number" ? row.amount_total : 0;
  }

  if (dueSoon <= 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      You have {formatCurrency(dueSoon, currencyCode)} due in the next 7 days
    </div>
  );
}
