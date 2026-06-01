"use client";

import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { formatCurrency } from "@/lib/format-currency";
import { OutgoingsSummaryCards } from "./outgoings-summary-cards";
import {
  baselineLineSumForReceipt,
  parseReceiptLineItems,
  recalculateAmountsFromLines,
  type ReceiptAmountBaseline,
  type ReceiptLineItemJson,
} from "@/lib/receipt-line-items";

/** Starting suggestions; merged with categories already used on this tenant's receipts. */
const DEFAULT_EXPENSE_CATEGORIES = [
  "Bank charges",
  "Fuel & mileage",
  "Insurance",
  "Marketing",
  "Materials & stock",
  "Office & stationery",
  "Other",
  "Professional fees",
  "Rent & rates",
  "Subscriptions & software",
  "Subsistence & meals",
  "Tools & equipment",
  "Travel & accommodation",
  "Utilities",
  "Vehicle & van",
  "Wages & subcontractor",
] as const;

function mergeCategorySuggestions(rows: { category?: string | null }[]): string[] {
  const set = new Set<string>(DEFAULT_EXPENSE_CATEGORIES);
  for (const row of rows) {
    const c = row.category?.trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type ReceiptRow = {
  id: string;
  supplier_name?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  amount_total?: number | null;
  amount_net?: number | null;
  amount_tax?: number | null;
  category?: string | null;
  payment_status?: string | null;
  processed_by_ai?: boolean | null;
  receipt_url?: string | null;
  notes?: string | null;
  line_items?: unknown;
  uploaded_by_name?: string | null;
  job_number?: number | null;
  job_title?: string | null;
};

type PaymentTerm = "due_7" | "due_14" | "due_28" | "due_30" | "custom";

type Draft = {
  supplier_name: string;
  invoice_date: string;
  due_date: string;
  amount_total: string;
  amount_net: string;
  amount_tax: string;
  category: string;
  payment_status: string;
  payment_term: PaymentTerm;
  notes: string;
};

function safeJsonPreview(raw: unknown): string | null {
  if (raw == null) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return JSON.stringify(parsed, null, 2);
  } catch {
    if (typeof raw === "string" && raw.trim()) return raw;
    return null;
  }
}

/** Older OCR runs stored `[scan:high]` etc. in notes; bookkeepers should not see that. */
function stripInternalScanPrefix(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes.replace(/^\[scan:[^\]]+\]\s*/i, "").trim();
}

function toDateInput(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function dateOnlyUtc(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function addDaysToIsoDate(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function paymentTermFromDueDate(
  invoiceDate: string,
  dueDate: string,
): PaymentTerm {
  if (!invoiceDate || !dueDate) return "custom";
  const options: Array<{ term: PaymentTerm; days: number }> = [
    { term: "due_7", days: 7 },
    { term: "due_14", days: 14 },
    { term: "due_28", days: 28 },
    { term: "due_30", days: 30 },
  ];
  for (const option of options) {
    if (addDaysToIsoDate(invoiceDate, option.days) === dueDate) return option.term;
  }
  return "custom";
}

function dueDateForPaymentTerm(invoiceDate: string, term: PaymentTerm): string {
  if (term === "custom") return "";
  const days =
    term === "due_7"
      ? 7
      : term === "due_14"
        ? 14
        : term === "due_28"
          ? 28
          : 30;
  return addDaysToIsoDate(invoiceDate || new Date().toISOString().slice(0, 10), days);
}
function normalizeReceiptPaymentStatus(
  raw: string | null | undefined,
): "paid" | "unpaid" {
  return (raw || "").trim().toLowerCase() === "paid" ? "paid" : "unpaid";
}

function defaultReceiptPaymentStatus(
  raw: string | null | undefined,
): "paid" | "unpaid" {
  const normalized = (raw || "").trim().toLowerCase();
  if (normalized === "paid" || normalized === "unpaid") return normalized;
  return "paid";
}

function statusForRow(
  row: Pick<ReceiptRow, "payment_status" | "due_date">,
): "Paid" | "Overdue" | "To Pay" {
  const statusRaw = (row.payment_status || "").trim().toLowerCase();
  const paid = statusRaw === "paid";
  const unpaid = statusRaw === "unpaid";
  if (paid) return "Paid";
  if (!unpaid) return "To Pay";
  const due = dateOnlyUtc(row.due_date);
  if (due == null) return "To Pay";
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return due < today ? "Overdue" : "To Pay";
}

function formatAmtField(n: number | null | undefined): string {
  if (n != null && Number.isFinite(n)) return String(n);
  return "";
}

function fmtDDMMYYYY(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${mo}/${d.getUTCFullYear()}`;
}

function escapeCSV(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Renders hover content in a fixed portal so table overflow does not clip it. */
function LineItemsHoverTrigger({
  ariaLabel,
  trigger,
  children,
}: {
  ariaLabel: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHideTimer() {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function placePanel() {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelWidth = Math.min(28 * 16, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panelWidth - 8));
    setPos({ top: r.bottom + 6, left });
  }

  function show() {
    clearHideTimer();
    placePanel();
    setOpen(true);
  }

  function hideSoon() {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => {
    return () => {
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onViewportChange() {
      placePanel();
    }
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  return (
    <>
      <span
        ref={anchorRef}
        className="relative inline-flex"
        onMouseEnter={show}
        onMouseLeave={hideSoon}
      >
        {trigger}
      </span>
      {typeof document !== "undefined" &&
        open &&
        createPortal(
          <div
            role="tooltip"
            aria-label={ariaLabel}
            className="pointer-events-auto fixed z-[100] max-h-[min(70vh,24rem)] w-[min(28rem,calc(100vw-1rem))] overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={show}
            onMouseLeave={hideSoon}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function ReceiptsEditableTable({
  rows,
  currencyCode = "GBP",
}: {
  rows: ReceiptRow[];
  currencyCode?: string | null;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    supplier_name: "",
    invoice_date: "",
    due_date: "",
    amount_total: "",
    amount_net: "",
    amount_tax: "",
    category: "",
    payment_status: "",
    payment_term: "custom",
    notes: "",
  });
  const [draftLineItems, setDraftLineItems] = useState<ReceiptLineItemJson[]>(
    [],
  );
  const editBaseline = useRef<ReceiptAmountBaseline | null>(null);

  // Filter state
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  });
  const [customRange, setCustomRange] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const categorySuggestions = useMemo(
    () => mergeCategorySuggestions(rows),
    [rows],
  );
  const categoryDatalistId = useId();

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  function startEdit(r: ReceiptRow) {
    setError(null);
    setEditingId(r.id);
    const lines = parseReceiptLineItems(r.line_items);
    editBaseline.current = {
      lineSum: baselineLineSumForReceipt({
        line_items: r.line_items,
        amount_total: r.amount_total ?? null,
      }),
      amount_tax: r.amount_tax ?? null,
      amount_net: r.amount_net ?? null,
      amount_total: r.amount_total ?? null,
    };
    setDraftLineItems(lines);
    setDraft({
      supplier_name: r.supplier_name ?? "",
      invoice_date: toDateInput(r.invoice_date),
      due_date: toDateInput(r.due_date),
      amount_total: formatAmtField(r.amount_total),
      amount_net: formatAmtField(r.amount_net),
      amount_tax: formatAmtField(r.amount_tax),
      category: r.category ?? "",
      payment_status: defaultReceiptPaymentStatus(r.payment_status),
      payment_term:
        defaultReceiptPaymentStatus(r.payment_status) === "paid"
          ? "custom"
          : paymentTermFromDueDate(
              toDateInput(r.invoice_date),
              toDateInput(r.due_date),
            ),
      notes: stripInternalScanPrefix(r.notes),
    });
  }

  function removeLineItem(index: number) {
    const next = draftLineItems.filter((_, i) => i !== index);
    setDraftLineItems(next);
    const baseline = editBaseline.current;
    if (!baseline) return;
    const amounts = recalculateAmountsFromLines(next, baseline);
    setDraft((d) => ({
      ...d,
      amount_total:
        amounts.amount_total != null ? String(amounts.amount_total) : "",
      amount_net: amounts.amount_net != null ? String(amounts.amount_net) : "",
      amount_tax: amounts.amount_tax != null ? String(amounts.amount_tax) : "",
    }));
  }

  async function save(id: string) {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        supplier_name: draft.supplier_name,
        invoice_date: draft.invoice_date || null,
        due_date: draft.payment_status === "paid" ? null : draft.due_date || null,
        category: draft.category,
        payment_status: draft.payment_status,
        notes: draft.notes,
        line_items: draftLineItems,
      };
      if (draftLineItems.length === 0) {
        payload.amount_total =
          draft.amount_total.trim() === "" ? null : Number(draft.amount_total);
        payload.amount_net =
          draft.amount_net.trim() === "" ? null : Number(draft.amount_net);
        payload.amount_tax =
          draft.amount_tax.trim() === "" ? null : Number(draft.amount_tax);
      }

      const res = await fetch(`/api/receipts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save outgoing.");
        return;
      }
      setEditingId(null);
      editBaseline.current = null;
      setDraftLineItems([]);
      router.refresh();
    } catch {
      setError("Network error while saving outgoing.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReceipt(id: string) {
    const ok = window.confirm(
      "Delete this outgoing row? This is intended for test cleanup.",
    );
    if (!ok) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to delete outgoing.");
        return;
      }
      if (editingId === id) {
        setEditingId(null);
        editBaseline.current = null;
      }
      router.refresh();
    } catch {
      setError("Network error while deleting outgoing.");
    } finally {
      setDeletingId(null);
    }
  }

  function prevMonth() {
    setSelectedMonth((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
  }
  function nextMonth() {
    setSelectedMonth((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  }

  function exportFileSuffix(): string {
    if (customRange && rangeFrom) return rangeFrom.slice(0, 7);
    const yr = selectedMonth.getUTCFullYear();
    const mo = String(selectedMonth.getUTCMonth() + 1).padStart(2, "0");
    return `${yr}-${mo}`;
  }

  function downloadCsv(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toCsvString(headers: string[], dataRows: string[][]): string {
    return [headers.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
  }

  function exportXero(exportRows: ReceiptRow[]) {
    const headers = [
      "ContactName", "InvoiceDate", "DueDate", "Description",
      "Quantity", "UnitAmount", "AccountCode", "TaxType", "TaxAmount",
    ];
    const data = exportRows.map((r) => [
      escapeCSV(r.supplier_name),
      escapeCSV(fmtDDMMYYYY(r.invoice_date)),
      escapeCSV(fmtDDMMYYYY(r.due_date)),
      escapeCSV(r.category),
      "1",
      escapeCSV(r.amount_net),
      "",
      "20% (VAT on Expenses)",
      escapeCSV(r.amount_tax),
    ]);
    downloadCsv(toCsvString(headers, data), `outgoings-xero-${exportFileSuffix()}.csv`);
  }

  function exportSage(exportRows: ReceiptRow[]) {
    const headers = ["Date", "Reference", "Supplier", "Net", "VAT", "Gross", "Category"];
    const data = exportRows.map((r) => [
      escapeCSV(fmtDDMMYYYY(r.invoice_date)),
      "",
      escapeCSV(r.supplier_name),
      escapeCSV(r.amount_net),
      escapeCSV(r.amount_tax),
      escapeCSV(r.amount_total),
      escapeCSV(r.category),
    ]);
    downloadCsv(toCsvString(headers, data), `outgoings-sage-${exportFileSuffix()}.csv`);
  }

  function exportGeneric(exportRows: ReceiptRow[]) {
    const headers = ["Supplier", "Date", "Amount", "Net", "VAT", "Category", "Status", "Job"];
    const data = exportRows.map((r) => [
      escapeCSV(r.supplier_name),
      escapeCSV(fmtDDMMYYYY(r.invoice_date)),
      escapeCSV(r.amount_total),
      escapeCSV(r.amount_net),
      escapeCSV(r.amount_tax),
      escapeCSV(r.category),
      escapeCSV(r.payment_status),
      escapeCSV(r.job_title ?? (r.job_number != null ? String(r.job_number) : "")),
    ]);
    downloadCsv(toCsvString(headers, data), `outgoings-${exportFileSuffix()}.csv`);
  }

  const { inPeriod, overduePrior } = useMemo(() => {
    const n = new Date();
    const todayUtc = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());

    function isOverdueRow(r: ReceiptRow): boolean {
      if (normalizeReceiptPaymentStatus(r.payment_status) !== "unpaid") return false;
      const due = dateOnlyUtc(r.due_date);
      return due != null && due < todayUtc;
    }

    let inPeriodRows: ReceiptRow[];

    if (customRange && rangeFrom && rangeTo) {
      const fromTs = dateOnlyUtc(rangeFrom) ?? -Infinity;
      const toTs = dateOnlyUtc(rangeTo) ?? Infinity;
      inPeriodRows = rows.filter((r) => {
        const d = dateOnlyUtc(r.invoice_date);
        return d != null && d >= fromTs && d <= toTs;
      });
    } else if (!customRange) {
      const yr = selectedMonth.getUTCFullYear();
      const mo = selectedMonth.getUTCMonth();
      inPeriodRows = rows.filter((r) => {
        if (!r.invoice_date) return false;
        const d = new Date(r.invoice_date);
        return d.getUTCFullYear() === yr && d.getUTCMonth() === mo;
      });
    } else {
      inPeriodRows = [];
    }

    const inPeriodIds = new Set(inPeriodRows.map((r) => r.id));
    const overduePriorRows = rows.filter((r) => isOverdueRow(r) && !inPeriodIds.has(r.id));

    return { inPeriod: inPeriodRows, overduePrior: overduePriorRows };
  }, [rows, customRange, rangeFrom, rangeTo, selectedMonth]);

  const filteredRows = [...overduePrior, ...inPeriod];

  const hasLines = draftLineItems.length > 0;

  function renderRow(r: ReceiptRow) {
    const isEditing = editingId === r.id;
    const parsedItems = parseReceiptLineItems(r.line_items);
    const rawItemsPreview = safeJsonPreview(r.line_items);
    return (
      <Fragment key={r.id}>
        <tr className="align-top hover:bg-slate-50">
          <td className="px-4 py-3 text-slate-900">
            {isEditing ? (
              <input
                value={draft.supplier_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, supplier_name: e.target.value }))
                }
                className="w-44 rounded border border-slate-300 px-2 py-1"
              />
            ) : (
              r.supplier_name ?? "—"
            )}
          </td>
          <td className="px-4 py-3 text-slate-700">
            {isEditing ? (
              <input
                type="date"
                value={draft.invoice_date}
                onChange={(e) =>
                  setDraft((d) => {
                    const invoice_date = e.target.value;
                    const shouldRecalc =
                      d.payment_status !== "paid" && d.payment_term !== "custom";
                    return {
                      ...d,
                      invoice_date,
                      due_date: shouldRecalc
                        ? dueDateForPaymentTerm(invoice_date, d.payment_term)
                        : d.due_date,
                    };
                  })
                }
                className="rounded border border-slate-300 px-2 py-1"
              />
            ) : r.invoice_date ? (
              new Date(r.invoice_date).toLocaleDateString()
            ) : (
              "—"
            )}
          </td>
          <td className="px-4 py-3 tabular-nums text-slate-700">
            {isEditing ? (
              hasLines ? (
                <div className="space-y-1">
                  <div>
                    <span className="text-slate-500">Gross </span>
                    <span className="font-medium">{draft.amount_total || "—"}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Net {draft.amount_net || "—"} · VAT {draft.amount_tax || "—"}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Totals follow line items. Remove lines to exclude from gross
                    and VAT (scaled from the scanned totals when lines lack
                    per-line tax).
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="sr-only" htmlFor={`amt-${r.id}`}>
                    Gross
                  </label>
                  <input
                    id={`amt-${r.id}`}
                    type="number"
                    step="0.01"
                    value={draft.amount_total}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, amount_total: e.target.value }))
                    }
                    className="w-28 rounded border border-slate-300 px-2 py-1"
                  />
                  <div className="flex flex-wrap gap-2 text-xs">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Net"
                      value={draft.amount_net}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, amount_net: e.target.value }))
                      }
                      className="w-24 rounded border border-slate-200 px-1 py-0.5"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="VAT"
                      value={draft.amount_tax}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, amount_tax: e.target.value }))
                      }
                      className="w-24 rounded border border-slate-200 px-1 py-0.5"
                    />
                  </div>
                </div>
              )
            ) : r.amount_total != null ? (
              <div>
                <div>{formatCurrency(r.amount_total, currencyCode)}</div>
                {(r.amount_net != null || r.amount_tax != null) && (
                  <div className="text-xs text-slate-500">
                    Net{" "}
                    {r.amount_net != null
                      ? formatCurrency(r.amount_net, currencyCode)
                      : "—"}{" "}
                    · VAT{" "}
                    {r.amount_tax != null
                      ? formatCurrency(r.amount_tax, currencyCode)
                      : "—"}
                  </div>
                )}
              </div>
            ) : (
              "—"
            )}
          </td>
          <td className="px-4 py-3 text-slate-700">
            {isEditing ? (
              <>
                <input
                  type="text"
                  list={categoryDatalistId}
                  value={draft.category}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, category: e.target.value }))
                  }
                  placeholder="Choose or type"
                  autoComplete="off"
                  className="w-48 max-w-full rounded border border-slate-300 px-2 py-1"
                />
                <datalist id={categoryDatalistId}>
                  {categorySuggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            ) : (
              r.category ?? "—"
            )}
          </td>
          <td className="px-4 py-3 text-slate-700">
            {isEditing ? (
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={normalizeReceiptPaymentStatus(draft.payment_status) === "paid"}
                    onChange={(e) =>
                      setDraft((d) => {
                        if (e.target.checked) {
                          return {
                            ...d,
                            payment_status: "paid",
                            payment_term: "custom",
                          };
                        }
                        const nextDueDate =
                          d.due_date || dueDateForPaymentTerm(d.invoice_date, "due_7");
                        return {
                          ...d,
                          payment_status: "unpaid",
                          payment_term: d.payment_term === "custom" ? "due_7" : d.payment_term,
                          due_date: nextDueDate,
                        };
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  Paid
                </label>
                {normalizeReceiptPaymentStatus(draft.payment_status) === "unpaid" ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={draft.payment_term}
                      onChange={(e) => {
                        const value = e.target.value as PaymentTerm;
                        setDraft((d) => ({
                          ...d,
                          payment_term: value,
                          due_date:
                            value === "custom"
                              ? d.due_date
                              : dueDateForPaymentTerm(d.invoice_date, value),
                        }));
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      <option value="due_7">Due in 7 days</option>
                      <option value="due_14">Due in 14 days</option>
                      <option value="due_28">Due in 28 days</option>
                      <option value="due_30">Due in 30 days</option>
                      <option value="custom">Custom date</option>
                    </select>
                    {draft.payment_term === "custom" ? (
                      <input
                        type="date"
                        value={draft.due_date}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, due_date: e.target.value }))
                        }
                        className="rounded border border-slate-300 px-2 py-1"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">
                        Due date auto-calculated from invoice date
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (

              (() => {
                const status = statusForRow(r);
                const className =
                  status === "Overdue"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : status === "To Pay"
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700";
                return (
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
                  >
                    {status}
                  </span>
                );
              })()
            )}
          </td>
          <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">
            {r.uploaded_by_name ?? "—"}
          </td>
          <td className="px-4 py-3 text-slate-700 text-sm whitespace-nowrap">
            {r.job_number != null ? (
              <span title={r.job_title ?? undefined}>
                #{r.job_number}
                {r.job_title ? (
                  <span className="ml-1 text-slate-500 text-xs">
                    {r.job_title.length > 20 ? r.job_title.slice(0, 20) + "…" : r.job_title}
                  </span>
                ) : null}
              </span>
            ) : (
              "—"
            )}
          </td>
          <td className="px-4 py-3 text-slate-700">
            {!isEditing && parsedItems.length > 0 ? (
              <LineItemsHoverTrigger
                ariaLabel="Line items"
                trigger={
                  <span
                    aria-label="Show line items"
                    title="Show line items"
                    className="inline-flex h-6 w-6 cursor-default items-center justify-center rounded border border-slate-300 bg-white text-xs text-slate-700"
                  >
                    ≡
                  </span>
                }
              >
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium text-slate-700">
                        Description
                      </th>
                      <th className="px-2 py-1 text-right font-medium text-slate-700">
                        Qty
                      </th>
                      <th className="px-2 py-1 text-right font-medium text-slate-700">
                        Price
                      </th>
                      <th className="px-2 py-1 text-right font-medium text-slate-700">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedItems.map((item, idx) => (
                      <tr key={`${r.id}-item-${idx}`}>
                        <td className="px-2 py-1 text-slate-700">
                          {item.description}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {item.qty != null ? item.qty : "—"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {item.price != null
                            ? formatCurrency(item.price, currencyCode)
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                          {item.total != null
                            ? formatCurrency(item.total, currencyCode)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </LineItemsHoverTrigger>
            ) : !isEditing && rawItemsPreview ? (
              <LineItemsHoverTrigger
                ariaLabel="Line items data"
                trigger={
                  <span
                    aria-label="Show line items JSON"
                    title="Show line items JSON"
                    className="inline-flex h-6 w-6 cursor-default items-center justify-center rounded border border-slate-300 bg-white text-[10px] text-slate-700"
                  >
                    {"{}"}
                  </span>
                }
              >
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">
                  {rawItemsPreview}
                </pre>
              </LineItemsHoverTrigger>
            ) : !isEditing ? (
              "—"
            ) : null}
          </td>
          <td className="px-4 py-3 text-slate-700">
            {r.processed_by_ai ? "Yes" : "No"}
          </td>
          <td className="px-4 py-3 text-slate-700">
            {r.receipt_url ? (
              <a
                href={r.receipt_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open file
              </a>
            ) : (
              "—"
            )}
          </td>
          <td className="px-4 py-3 text-slate-700">
            {isEditing ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(r.id)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setEditingId(null);
                    editBaseline.current = null;
                    setDraftLineItems([]);
                    setError(null);
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingId === r.id}
                  onClick={() => void deleteReceipt(r.id)}
                  title="Delete outgoing"
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  🗑
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deletingId === r.id}
                  onClick={() => void deleteReceipt(r.id)}
                  title="Delete outgoing"
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  🗑
                </button>
              </div>
            )}
          </td>
        </tr>
        {isEditing ? (
          <tr key={`${r.id}-lines`} className="bg-slate-50">
            <td colSpan={11} className="px-4 py-3">
              <p className="mb-2 text-xs font-medium text-slate-700">
                Line items (bookkeeper)
              </p>
              {draftLineItems.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No line items stored — use gross/net/VAT fields above, or rescan
                  the receipt to capture lines.
                </p>
              ) : (
                <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-700">
                          Description
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-slate-700">
                          Qty
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-slate-700">
                          Price
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-slate-700">
                          Line total
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-slate-700">
                          Remove
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftLineItems.map((item, idx) => (
                        <tr key={`edit-line-${r.id}-${idx}`} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 text-slate-800">
                            {item.description}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                            {item.qty != null ? item.qty : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                            {item.price != null
                            ? formatCurrency(item.price, currencyCode)
                            : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                            {item.total != null
                            ? formatCurrency(item.total, currencyCode)
                            : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              className="text-red-600 underline hover:text-red-800"
                              onClick={() => removeLineItem(idx)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <textarea
                value={draft.notes}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value }))
                }
                rows={2}
                placeholder="Notes"
                className="mt-3 w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
              />
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  }

  return (
    <div className="mt-6">
      <OutgoingsSummaryCards rows={filteredRows} currencyCode={currencyCode} />
      {/* Filter + Export bar */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {!customRange && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              ‹
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700">
              {MONTH_NAMES[selectedMonth.getUTCMonth()]} {selectedMonth.getUTCFullYear()}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              ›
            </button>
          </div>
        )}

        {customRange && (
          <div className="flex items-center gap-2 text-sm">
            <label className="sr-only" htmlFor="range-from">From</label>
            <input
              id="range-from"
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-slate-700"
            />
            <span className="text-slate-400">–</span>
            <label className="sr-only" htmlFor="range-to">To</label>
            <input
              id="range-to"
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-slate-700"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setCustomRange((v) => !v)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            customRange
              ? "border-slate-700 bg-slate-700 text-white"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Custom Range
        </button>

        <div ref={exportRef} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Export
            <svg className="h-3 w-3 text-slate-400" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M6 8L2 4h8z" />
            </svg>
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <button
                type="button"
                onClick={() => { exportXero(filteredRows); setExportOpen(false); }}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Xero CSV
              </button>
              <button
                type="button"
                onClick={() => { exportSage(filteredRows); setExportOpen(false); }}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Sage CSV
              </button>
              <button
                type="button"
                onClick={() => { exportGeneric(filteredRows); setExportOpen(false); }}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                CSV
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Supplier</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Date</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Amount</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Category</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Uploaded by</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Job</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Items</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">AI</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">File</th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                  No outgoings for this period.
                </td>
              </tr>
            ) : (
              <>
                {overduePrior.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={11}
                        className="bg-red-50/60 px-4 py-1.5 text-xs font-medium text-red-500"
                      >
                        Overdue from previous periods
                      </td>
                    </tr>
                    {overduePrior.map((r) => renderRow(r))}
                  </>
                )}
                {inPeriod.map((r) => renderRow(r))}
              </>
            )}
          </tbody>
        </table>
        {error ? (
          <p className="border-t border-slate-200 px-4 py-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
