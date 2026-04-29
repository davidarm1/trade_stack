import { getReceipts } from "@/actions/receipts";
import { getSettings } from "@/actions/settings";
import { AddOutgoingModal } from "./add-outgoing-modal";
import { OutgoingsDueSoonAlert } from "./outgoings-due-soon-alert";
import { ReceiptsEditableTable } from "./receipts-editable-table";
import { OutgoingsSummaryCards } from "./outgoings-summary-cards";

export default async function ReceiptsPage() {
  const [{ data: rows, error }, settingsRes] = await Promise.all([
    getReceipts(),
    getSettings(),
  ]);

  const currencyCode =
    settingsRes.data?.tenant?.currency?.trim() || "GBP";

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Outgoings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track and manage your business outgoings — invoices, receipts and supplier payments.
          </p>
        </div>
        <AddOutgoingModal />
      </div>

      <OutgoingsSummaryCards rows={rows ?? []} currencyCode={currencyCode} />
      <OutgoingsDueSoonAlert rows={rows ?? []} currencyCode={currencyCode} />
      <ReceiptsEditableTable rows={rows ?? []} currencyCode={currencyCode} />
    </div>
  );
}
