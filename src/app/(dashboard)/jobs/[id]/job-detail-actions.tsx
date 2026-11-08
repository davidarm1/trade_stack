"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  cancelScheduledJobInvoice,
  scheduleJobInvoice,
  sendJobInvoice,
  sendJobSheetEmail,
  updateJob,
} from "@/actions/jobs";
import { WorkflowStepper } from "@/components/workflow-stepper";
import { jobInvoiceEmailSubject } from "@/lib/job-number";

const LONDON = "Europe/London";

function formatScheduled(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Next 09:00 as a value for <input type="datetime-local"> in the browser's zone. */
function defaultScheduleValue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function JobDetailActions({
  jobId,
  jobNumber,
  jobTitle,
  currentJobSheetUrl,
  assignedEngineerMembershipId,
  sentToEngineerAt,
  receivedFromEngineerAt,
  signedAt,
  approvedAt,
  invoiceSentAt,
  signatureRequired: signatureRequiredProp,
  invoiceVersionCount,
  initialInvoiceRecipients,
  scheduledFor = null,
  scheduleStatus = null,
  scheduleError = null,
  isPaid,
  engineers,
}: {
  jobId: string;
  jobNumber: number | null;
  jobTitle: string;
  currentJobSheetUrl: string | null;
  assignedEngineerMembershipId: string | null;
  sentToEngineerAt: string | null;
  receivedFromEngineerAt: string | null;
  signedAt: string | null;
  approvedAt: string | null;
  invoiceSentAt: string | null;
  signatureRequired: boolean | null;
  invoiceVersionCount: number;
  initialInvoiceRecipients: string;
  scheduledFor?: string | null;
  scheduleStatus?: string | null;
  scheduleError?: string | null;
  isPaid: boolean;
  engineers: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedEngineerId, setSelectedEngineerId] = useState(
    assignedEngineerMembershipId ?? "",
  );
  const [emailModalType, setEmailModalType] = useState<"invoice" | "jobsheet" | null>(null);
  const [invoiceRecipients, setInvoiceRecipients] = useState(
    initialInvoiceRecipients,
  );
  const [invoiceReason, setInvoiceReason] = useState("Amount corrected");
  const [sendMode, setSendMode] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const isScheduled = scheduleStatus === "scheduled" && Boolean(scheduledFor);
  const hasEngineer = selectedEngineerId.trim().length > 0;
  const engineerAssigned = assignedEngineerMembershipId?.trim().length
    ? true
    : false;
  const sentDone = Boolean(sentToEngineerAt?.trim());
  // A job created with an engineer already picked has assigned_engineer_membership_id
  // but no sent_to_engineer_at (that is only stamped by "Save engineer"), so
  // treat an assigned engineer as enough to move on to completion.
  const engineerReady = sentDone || engineerAssigned;
  const engineerCompletedDone = Boolean(receivedFromEngineerAt?.trim());
  const signatureDone = Boolean(signedAt?.trim());
  const approvedDone = Boolean(approvedAt?.trim());
  const invoiceDone = Boolean(invoiceSentAt?.trim());
  const paidDone = isPaid;
  const signatureRequired = signatureRequiredProp ?? true;

  const engineerCompleteEnabled =
    engineerReady && !engineerCompletedDone && (!signatureRequired || signatureDone);
  const approveEnabled = engineerCompletedDone && !approvedDone;
  const invoiceEnabled = approvedDone;
  const previewInvoiceEnabled = approvedDone;
  const jobSheetEmailEnabled = Boolean(currentJobSheetUrl?.trim());
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
          : engineerReady
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
    setEmailModalType(null);
    setMsg("Invoice emailed and marked as sent.");
    router.refresh();
  }

  async function handleScheduleInvoice() {
    if (busyKey) return;
    const recipients = invoiceRecipients.trim();
    if (!recipients) {
      setMsg("Enter at least one recipient email.");
      return;
    }
    const reason = invoiceVersionCount >= 1 ? invoiceReason.trim() : null;
    if (invoiceVersionCount >= 1 && !reason) {
      setMsg("Invoice version reason is required for v2+.");
      return;
    }
    const when = new Date(scheduleAt);
    if (!scheduleAt || Number.isNaN(when.getTime())) {
      setMsg("Choose a date and time to send the invoice.");
      return;
    }
    setBusyKey("invoice");
    setMsg(null);
    const { data, error } = await scheduleJobInvoice(
      jobId,
      when.toISOString(),
      recipients,
      reason,
    );
    setBusyKey(null);
    if (error) {
      setMsg(error);
      return;
    }
    setEmailModalType(null);
    setMsg(
      `Marked as scheduled: the invoice will be emailed ${formatScheduled(data!.scheduled_for)}.`,
    );
    router.refresh();
  }

  async function handleCancelSchedule() {
    if (busyKey) return;
    setBusyKey("cancel_schedule");
    setMsg(null);
    const { error } = await cancelScheduledJobInvoice(jobId);
    setBusyKey(null);
    if (error) {
      setMsg(error);
      return;
    }
    setMsg("Marked as cancelled: the scheduled invoice will not be sent.");
    router.refresh();
  }

  async function handleSendJobSheet() {
    if (busyKey) return;
    const recipients = invoiceRecipients.trim();
    if (!recipients) {
      setMsg("Enter at least one recipient email.");
      return;
    }
    if (!currentJobSheetUrl?.trim()) {
      setMsg("Create the job sheet PDF first.");
      return;
    }
    setBusyKey("jobsheet");
    setMsg(null);
    const { error } = await sendJobSheetEmail(jobId, recipients);
    setBusyKey(null);
    if (error) {
      setMsg(error);
      return;
    }
    setEmailModalType(null);
    setMsg("Job sheet emailed.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <WorkflowStepper stages={workflowStages} className="xl:grid-cols-7" />
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
                assigned_engineer_membership_id: selectedEngineerId,
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
            setSendMode("now");
            setScheduleAt(
              scheduledFor && scheduleStatus === "scheduled"
                ? ""
                : defaultScheduleValue(),
            );
            setEmailModalType("invoice");
          }}
        >
          {invoiceDone ? "Send New Invoice Version" : "Send Invoice"}
        </button>
        <button
          type="button"
          disabled={busyKey !== null || !jobSheetEmailEnabled}
          className={jobSheetEmailEnabled ? readyBtn : blockedBtn}
          title={jobInvoiceEmailSubject({
            jobNumber,
            title: `${jobTitle} Job Sheet`,
          })}
          onClick={() => {
            if (busyKey) return;
            setEmailModalType("jobsheet");
          }}
        >
          Send Job Sheet
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
      {isScheduled && scheduledFor ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span>
            Invoice scheduled to send <strong>{formatScheduled(scheduledFor)}</strong>.
          </span>
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => {
              setSendMode("later");
              setScheduleAt(defaultScheduleValue());
              setEmailModalType("invoice");
            }}
            className="underline underline-offset-2 disabled:opacity-60"
          >
            Change
          </button>
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => void handleCancelSchedule()}
            className="underline underline-offset-2 disabled:opacity-60"
          >
            {busyKey === "cancel_schedule" ? "Cancelling..." : "Cancel"}
          </button>
        </div>
      ) : null}
      {scheduleStatus === "failed" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>
            The scheduled invoice could not be sent
            {scheduleError ? `: ${scheduleError}` : "."}
          </span>
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => {
              setSendMode("later");
              setScheduleAt(defaultScheduleValue());
              setEmailModalType("invoice");
            }}
            className="underline underline-offset-2 disabled:opacity-60"
          >
            Reschedule
          </button>
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() => void handleCancelSchedule()}
            className="underline underline-offset-2 disabled:opacity-60"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {emailModalType ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setEmailModalType(null)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              {emailModalType === "invoice" ? "Send invoice email" : "Send job sheet email"}
            </h3>
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
            {emailModalType === "invoice" ? (
              <fieldset className="mt-3">
                <legend className="text-sm font-medium text-slate-700">When to send</legend>
                <div className="mt-1 flex gap-4 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="send_mode"
                      checked={sendMode === "now"}
                      onChange={() => setSendMode("now")}
                    />
                    Send now
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="send_mode"
                      checked={sendMode === "later"}
                      onChange={() => {
                        setSendMode("later");
                        if (!scheduleAt) setScheduleAt(defaultScheduleValue());
                      }}
                    />
                    Schedule for later
                  </label>
                </div>
                {sendMode === "later" ? (
                  <div className="mt-2">
                    <input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      The invoice is created and dated when it is sent, using the
                      job as it is at that time. Checked every few minutes.
                    </p>
                  </div>
                ) : null}
              </fieldset>
            ) : null}
            {emailModalType === "invoice" && invoiceVersionCount >= 1 ? (
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
                onClick={() => setEmailModalType(null)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void (emailModalType === "invoice"
                    ? sendMode === "later"
                      ? handleScheduleInvoice()
                      : handleSendInvoice()
                    : handleSendJobSheet())
                }
                disabled={busyKey === emailModalType}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busyKey === emailModalType
                  ? emailModalType === "invoice" && sendMode === "later"
                    ? "Scheduling..."
                    : "Sending..."
                  : emailModalType === "invoice" && sendMode === "later"
                    ? "Schedule"
                    : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
