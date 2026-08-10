"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendJobInvoice, updateJob } from "@/actions/jobs";
import { jobInvoiceEmailSubject } from "@/lib/job-number";

export function JobDetailActions({
  jobId,
  jobNumber,
  jobTitle,
  assignedEngineerId,
  sentToEngineerAt,
  receivedFromEngineerAt,
  signedAt,
  approvedAt,
  invoiceSentAt,
  signatureRequired: signatureRequiredProp,
  invoiceVersionCount,
  initialInvoiceRecipients,
  isPaid,
  engineers,
}: {
  jobId: string;
  jobNumber: number | null;
  jobTitle: string;
  assignedEngineerId: string | null;
  sentToEngineerAt: string | null;
  receivedFromEngineerAt: string | null;
  signedAt: string | null;
  approvedAt: string | null;
  invoiceSentAt: string | null;
  signatureRequired: boolean | null;
  invoiceVersionCount: number;
  initialInvoiceRecipients: string;
  isPaid: boolean;
  engineers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState(
    assignedEngineerId ?? "",
  );
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceRecipients, setInvoiceRecipients] = useState(
    initialInvoiceRecipients,
  );
  const [invoiceReason, setInvoiceReason] = useState("Amount corrected");
  const hasEngineer = selectedEngineerId.trim().length > 0;
  const engineerAssigned = assignedEngineerId?.trim().length
    ? true
    : false;
  const sentDone = Boolean(sentToEngineerAt?.trim());
  const engineerCompletedDone = Boolean(receivedFromEngineerAt?.trim());
  const signatureDone = Boolean(signedAt?.trim());
  const approvedDone = Boolean(approvedAt?.trim());
  const invoiceDone = Boolean(invoiceSentAt?.trim());
  const paidDone = isPaid;
  const signatureRequired = signatureRequiredProp ?? true;

  const engineerCompleteEnabled =
    sentDone && !engineerCompletedDone && (!signatureRequired || signatureDone);
  const approveEnabled = engineerCompletedDone && !approvedDone;
  const invoiceEnabled = approvedDone;
  const previewInvoiceEnabled = approvedDone;
  const paidEnabled = invoiceDone && !paidDone;

  const doneBtn =
    "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900";
  const readyBtn =
    "rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 hover:bg-sky-100";
  const idleBtn =
    "rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50";
  const blockedBtn =
    "rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400";
  const workflowStages = [
    {
      key: "engineer",
      label: "Engineer Assigned",
      state: engineerAssigned ? "done" : hasEngineer ? "current" : "blocked",
      detail: engineerAssigned
        ? "Engineer assigned"
        : hasEngineer
          ? "Ready to save"
          : "Pick an engineer",
    },
    {
      key: "signature",
      label: signatureRequired
        ? "Waiting for Client Signature"
        : "Signature Not Required",
      state: signatureRequired
        ? signatureDone
          ? "done"
          : sentDone
            ? "current"
            : "blocked"
        : "skipped",
      detail: signatureRequired
        ? signatureDone
          ? "Client signed"
          : "Waiting on client"
        : "Engineer can finish without signature",
    },
    {
      key: "approve",
      label: "Approve",
      state: approvedDone
        ? "done"
        : engineerCompletedDone
          ? "current"
          : "blocked",
      detail: approvedDone
        ? "Approved"
        : engineerCompletedDone
          ? "Ready to approve"
          : "Waiting for engineer completion",
    },
    {
      key: "preview",
      label: "Preview Invoice PDF",
      state: previewInvoiceEnabled ? "ready" : "blocked",
      detail: previewInvoiceEnabled ? "Available now" : "Unlocks after approval",
    },
    {
      key: "invoice",
      label: "Send Invoice",
      state: invoiceDone ? "done" : invoiceEnabled ? "current" : "blocked",
      detail: invoiceDone
        ? "Invoice sent"
        : invoiceEnabled
          ? "Ready to send"
          : "Needs approval",
    },
    {
      key: "paid",
      label: "Mark Paid",
      state: paidDone ? "done" : paidEnabled ? "current" : "blocked",
      detail: paidDone
        ? "Marked paid"
        : paidEnabled
          ? "Ready to mark paid"
          : "Awaiting sent invoice",
    },
  ] as const;

  async function patch(
    key: string,
    partial: Record<string, unknown>,
    successMessage: string,
  ) {
    if (busyKey) return;
    setBusyKey(key);
    setMsg(null);
    const { error } = await updateJob(jobId, partial as never);
    if (error) setMsg(error);
    else {
      setMsg(successMessage);
      router.refresh();
    }
    setBusyKey(null);
  }

  async function handleSendInvoice() {
    if (busyKey) return;
    const recipients = invoiceRecipients.trim();
    if (!recipients) {
      setMsg("Enter at least one recipient email.");
      return;
    }
    const reason =
      invoiceVersionCount >= 1 ? invoiceReason.trim() : null;
    if (invoiceVersionCount >= 1 && !reason) {
      setMsg("Invoice version reason is required for v2+.");
      return;
    }
    setBusyKey("invoice");
    setMsg(null);
    const { error } = await sendJobInvoice(jobId, reason, recipients);
    setBusyKey(null);
    if (error) {
      setMsg(error);
      return;
    }
    setInvoiceModalOpen(false);
    setMsg("Invoice emailed and marked as sent.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        {workflowStages.map((stage) => {
          const state = stage.state;
          const done = state === "done";
          const current = state === "current";
          const ready = state === "ready";
          const skipped = state === "skipped";
          const chipClass = done
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : current
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : ready
                ? "border-sky-200 bg-sky-50 text-sky-800"
                : skipped
                  ? "border-violet-200 bg-violet-50 text-violet-800"
                  : "border-slate-200 bg-slate-50 text-slate-400";
          const dot = done ? "✓" : ready ? "↗" : skipped ? "↷" : current ? "•" : "·";
          return (
            <div
              key={stage.key}
              className={`rounded-lg border px-3 py-2 text-xs shadow-sm ${chipClass}`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-current px-1 text-[10px] font-semibold leading-none">
                  {dot}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{stage.label}</p>
                  <p className="mt-0.5 text-[11px] opacity-80">{stage.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={selectedEngineerId}
          disabled={busyKey !== null || (sentDone && engineerAssigned)}
          onChange={(e) => setSelectedEngineerId(e.target.value)}
          className={sentDone && engineerAssigned ? doneBtn : idleBtn}
          title="Assign engineer"
        >
          <option value="">Assign engineer…</option>
          {engineers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busyKey !== null}
          className={idleBtn}
          onClick={() => router.push(`/jobs/${jobId}/edit`)}
        >
          Edit
        </button>
        <button
          type="button"
          disabled={busyKey !== null || !hasEngineer}
          className={hasEngineer ? readyBtn : blockedBtn}
          onClick={() =>
            patch(
              "save_engineer",
              {
                assigned_engineer_id: selectedEngineerId,
                sent_to_engineer_at: new Date().toISOString(),
                status: "in_progress",
              },
              "Engineer saved to the job.",
            )
          }
        >
          {busyKey === "save_engineer" ? "Saving..." : "Save engineer"}
        </button>
        <button
          type="button"
          disabled={busyKey !== null || !engineerCompleteEnabled}
          className={
            engineerCompletedDone
              ? doneBtn
              : engineerCompleteEnabled
                ? readyBtn
                : blockedBtn
          }
          onClick={() =>
            patch(
              "engineer_complete",
              {
                received_from_engineer_at: new Date().toISOString(),
                status: "in_progress",
              },
              "Marked as completed by engineer.",
            )
          }
        >
          {engineerCompletedDone
            ? "Completed by Engineer"
            : signatureRequired && !signatureDone
              ? "Waiting for Client Signature"
              : "Mark Completed by Engineer"}
        </button>
        <button
          type="button"
          disabled={busyKey !== null || !approveEnabled}
          className={approvedDone ? doneBtn : approveEnabled ? readyBtn : blockedBtn}
          onClick={() =>
            patch(
              "approve",
              {
                approved_at: new Date().toISOString(),
                status: "completed",
              },
              "Marked as approved.",
            )
          }
        >
          {approvedDone ? "Approved" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busyKey !== null || !previewInvoiceEnabled}
          className={previewInvoiceEnabled ? idleBtn : blockedBtn}
          onClick={() => {
            const opened = window.open(
              `/api/jobs/${jobId}/invoice-pdf`,
              "_blank",
              "noopener,noreferrer",
            );
            if (!opened) {
              setMsg("Popup blocked. Allow popups to preview the invoice PDF.");
            }
          }}
        >
          Preview Invoice PDF
        </button>
        <button
          type="button"
          disabled={busyKey !== null || !invoiceEnabled}
          className={invoiceEnabled ? readyBtn : blockedBtn}
          title={jobInvoiceEmailSubject({
            jobNumber,
            title: jobTitle,
          })}
          onClick={() => {
            if (busyKey) return;
            setInvoiceModalOpen(true);
          }}
        >
          {invoiceDone ? "Send New Invoice Version" : "Send Invoice"}
        </button>
        {paidDone ? (
          <button
            type="button"
            disabled={busyKey !== null}
            className="rounded-md border border-amber-300 px-3 py-2 text-sm text-amber-900 hover:bg-amber-50"
            onClick={() =>
              patch(
                "undo_paid",
                {
                  invoice_paid_at: null,
                  payment_status: "unpaid",
                },
                "Payment status reverted to unpaid.",
              )
            }
          >
            Undo Paid
          </button>
        ) : (
          <button
            type="button"
            disabled={busyKey !== null || !paidEnabled}
            className={paidEnabled ? readyBtn : blockedBtn}
            onClick={() =>
              patch(
                "paid",
                {
                  invoice_paid_at: new Date().toISOString(),
                  payment_status: "paid",
                },
                "Marked as paid.",
              )
            }
          >
            Mark Paid
          </button>
        )}
      </div>
      {msg && (
        <p
          className={`text-sm ${
            msg.toLowerCase().includes("marked as")
              ? "text-emerald-700"
              : "text-amber-800"
          }`}
        >
          {msg}
        </p>
      )}
      {invoiceModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setInvoiceModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">Send invoice email</h3>
            <p className="mt-1 text-sm text-slate-600">
              Enter one or more recipient emails, comma delimited.
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Recipients
              <textarea
                value={invoiceRecipients}
                onChange={(e) => setInvoiceRecipients(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="customer@example.com, office@example.com"
              />
            </label>
            {invoiceVersionCount >= 1 ? (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Reason for this new version
                <input
                  value={invoiceReason}
                  onChange={(e) => setInvoiceReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Amount corrected"
                />
              </label>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInvoiceModalOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSendInvoice()}
                disabled={busyKey === "invoice"}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busyKey === "invoice" ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
