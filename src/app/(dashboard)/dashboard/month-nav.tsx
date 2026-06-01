"use client";

import { useRouter } from "next/navigation";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function MonthNav({ year, month }: { year: number; month: number }) {
  const router = useRouter();

  const now = new Date();
  const maxAllowed = new Date(now.getFullYear(), now.getMonth() + 12, 1);

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const nextDate = new Date(nextYear, nextMonth - 1, 1);
  const atMax = nextDate > maxAllowed;

  const navigate = (y: number, m: number) => {
    router.push(`?month=${y}-${pad2(m)}`);
  };

  const btnBase =
    "flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50";

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => navigate(prevYear, prevMonth)}
        className={btnBase}
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700">
        {new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
          new Date(year, month - 1, 1),
        )}
      </span>
      <button
        type="button"
        onClick={() => !atMax && navigate(nextYear, nextMonth)}
        disabled={atMax}
        className={`${btnBase} disabled:cursor-not-allowed disabled:opacity-40`}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
