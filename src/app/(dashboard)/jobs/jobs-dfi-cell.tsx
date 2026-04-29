"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { jobInvoiceEmailSubject } from "@/lib/job-number";

const LEAVE_MS = 200;
const PANEL_GAP = 6;
const VIEWPORT_MARGIN = 8;

function clampPanelToViewport(
  trigger: DOMRect,
  panel: DOMRect,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ph = panel.height;
  const pw = panel.width;

  const spaceBelow = vh - trigger.bottom - VIEWPORT_MARGIN;
  const spaceAbove = trigger.top - VIEWPORT_MARGIN;

  let top =
    ph + PANEL_GAP > spaceBelow && spaceAbove >= spaceBelow
      ? trigger.top - ph - PANEL_GAP
      : trigger.bottom + PANEL_GAP;

  let left = trigger.left;

  if (top + ph > vh - VIEWPORT_MARGIN) {
    top = vh - ph - VIEWPORT_MARGIN;
  }
  if (top < VIEWPORT_MARGIN) {
    top = VIEWPORT_MARGIN;
  }

  if (left + pw > vw - VIEWPORT_MARGIN) {
    left = vw - pw - VIEWPORT_MARGIN;
  }
  if (left < VIEWPORT_MARGIN) {
    left = VIEWPORT_MARGIN;
  }

  return { top, left };
}

export function JobsDfiCell({
  jobId,
  jobNumber,
  jobTitle,
  daysFromInvoice,
  invoiceDateLabel,
  paymentTermsDays,
  dueDateLabel,
  daysToInvoiceDue,
  invoiceSentToEmail,
  invoiceSendLog,
}: {
  jobId: string;
  jobNumber: number | null;
  jobTitle: string | null;
  daysFromInvoice: number | null;
  invoiceDateLabel: string;
  paymentTermsDays: number;
  dueDateLabel: string;
  daysToInvoiceDue: number | null;
  invoiceSentToEmail: string | null;
  invoiceSendLog: { id: string; sent_at: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current != null) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const t = trigger.getBoundingClientRect();
    const panel = panelRef.current;
    if (panel) {
      const p = panel.getBoundingClientRect();
      setPos(clampPanelToViewport(t, p));
    } else {
      setPos({ top: t.bottom + PANEL_GAP, left: t.left });
    }
  }, []);

  const onOpen = useCallback(() => {
    clearLeaveTimer();
    const trigger = triggerRef.current;
    if (trigger) {
      const t = trigger.getBoundingClientRect();
      setPos({ top: t.bottom + PANEL_GAP, left: t.left });
    }
    setOpen(true);
  }, [clearLeaveTimer]);

  const onCloseSoon = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => setOpen(false), LEAVE_MS);
  }, [clearLeaveTimer]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  if (daysFromInvoice == null) {
    return <span className="text-slate-400">—</span>;
  }

  const title = (jobTitle ?? "").trim() || "Invoice";
  const subject = jobInvoiceEmailSubject({ jobNumber, title });
  const email = invoiceSentToEmail?.trim() ?? "";
  const mailto =
    email.length > 0
      ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}`
      : null;

  const dfiUrgent =
    daysToInvoiceDue != null && daysToInvoiceDue < 5;

  const panel = open ? (
    <div
      ref={panelRef}
      className="fixed z-[100] w-64 max-h-[min(24rem,calc(100vh-1rem))] overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onOpen}
      onMouseLeave={onCloseSoon}
    >
      <div className="space-y-2">
        <div>
          <div className="font-medium text-slate-500">Invoice Date:</div>
          <div className="text-slate-900">{invoiceDateLabel}</div>
        </div>
        <div>
          <div className="font-medium text-slate-500">Payment Days Agreed:</div>
          <div className="text-slate-900">{paymentTermsDays}</div>
        </div>
        <div>
          <div className="font-medium text-slate-500">Due Date:</div>
          <div className="text-slate-900">{dueDateLabel}</div>
        </div>
        <div>
          {daysToInvoiceDue != null && daysToInvoiceDue < 0 ? (
            <div className="font-medium text-red-600">
              Invoice Now Late By {Math.abs(daysToInvoiceDue)}{" "}
              {Math.abs(daysToInvoiceDue) === 1 ? "Day" : "Days"}
            </div>
          ) : (
            <>
              <div className="font-medium text-slate-500">
                Days to invoice due:
              </div>
              <div className="text-slate-900">
                {daysToInvoiceDue == null ? "—" : String(daysToInvoiceDue)}
              </div>
            </>
          )}
        </div>
        <div>
          <div className="font-medium text-slate-500">Resend Invoice:</div>
          <div className="mt-0.5">
            {mailto ? (
              <a
                href={mailto}
                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
              >
                Open email to resend
              </a>
            ) : (
              <Link
                href={`/jobs/${jobId}`}
                className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
              >
                Open job
              </Link>
            )}
          </div>
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="font-medium text-slate-500">Send History:</div>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
              Each send or resend is logged below (newest first).
            </p>
            <ul className="mt-1.5 max-h-28 space-y-1 overflow-y-auto text-[11px] leading-snug text-slate-600">
              {invoiceSendLog.length === 0 ? (
                <li className="text-slate-500 italic">No sends logged yet.</li>
              ) : (
                invoiceSendLog.map((row) => (
                  <li key={row.id}>
                    {new Date(row.sent_at).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <span
        ref={triggerRef}
        className={
          dfiUrgent
            ? "cursor-default font-mono tabular-nums font-medium text-red-600"
            : "cursor-default font-mono tabular-nums text-slate-800"
        }
        onMouseEnter={onOpen}
        onMouseLeave={onCloseSoon}
      >
        {daysFromInvoice}
      </span>
      {typeof document !== "undefined" && panel
        ? createPortal(panel, document.body)
        : null}
    </>
  );
}
