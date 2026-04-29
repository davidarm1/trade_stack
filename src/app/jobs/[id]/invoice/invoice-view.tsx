"use client";

import { useState } from "react";

export function InvoiceView({
  jobId,
  fileName,
  brandingShowLogo,
  brandingShowCompanyName,
  companyLogoUrl,
  invoice,
}: {
  jobId: string;
  fileName: string;
  brandingShowLogo: boolean;
  brandingShowCompanyName: boolean;
  companyLogoUrl: string | null;
  invoice: {
    companyName: string;
    companyAddress1: string;
    companyAddress2: string;
    companyTown: string;
    companyPostcode: string;
    companyPhone: string;
    companyEmail: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    jobReference: string;
    clientName: string;
    clientAddress1: string;
    clientAddress2: string;
    clientTown: string;
    clientPostcode: string;
    currency: string;
    subtotal: number;
    vatAmount: number;
    total: number;
    vatRate: number;
    lineItems: Array<{
      id: string;
      item: string;
      qty: number;
      unitPrice: number;
      lineTotal: number;
    }>;
  };
}) {
  const [busy, setBusy] = useState(false);
  const src = `/api/jobs/${jobId}/invoice-pdf`;
  const money = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: invoice.currency || "GBP",
    }).format(Number.isFinite(n) ? n : 0);
  const detailLines = [
    invoice.companyAddress1,
    invoice.companyAddress2,
    [invoice.companyTown, invoice.companyPostcode].filter(Boolean).join(" "),
    invoice.companyPhone ? `Tel: ${invoice.companyPhone}` : "",
    invoice.companyEmail ? `Email: ${invoice.companyEmail}` : "",
  ].filter(Boolean);
  /** Postal-style block (not affected by header logo/name branding). */
  const fromAddressLines = [invoice.companyName, ...detailLines].filter(Boolean);
  const billLines = [
    invoice.clientName,
    invoice.clientAddress1,
    invoice.clientAddress2,
    [invoice.clientTown, invoice.clientPostcode].filter(Boolean).join(" "),
  ].filter(Boolean);

  async function onDownload() {
    setBusy(true);
    try {
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not download PDF (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  function onPrint() {
    window.print();
  }

  return (
    <div className="invoice-print-page min-h-screen bg-[#f3f4f6] px-4 py-8 print:bg-white print:p-0">
      <div className="invoice-toolbar fixed right-4 top-4 z-50 flex gap-2 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur-sm print:hidden">
        <button
          type="button"
          onClick={onPrint}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => void onDownload()}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? "Preparing..." : "Download PDF"}
        </button>
      </div>

      <div className="invoice-card mx-auto w-full max-w-[794px] min-h-[1123px] rounded-md bg-white p-10 shadow-[0_10px_25px_rgba(15,23,42,0.12)] print:max-w-none print:min-h-0 print:rounded-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div className="space-y-1">
            {brandingShowLogo && companyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={companyLogoUrl}
                alt=""
                className="mb-2 h-14 max-w-[220px] object-contain object-left"
              />
            ) : null}
            {brandingShowCompanyName ? (
              <p className="text-sm font-semibold text-slate-900">{invoice.companyName}</p>
            ) : null}
            {detailLines.map((line, i) => (
              <p key={i} className="text-sm text-slate-600">
                {line}
              </p>
            ))}
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-bold tracking-wide text-slate-800">INVOICE</h1>
            <p className="mt-2 text-sm text-slate-600">Invoice: {invoice.invoiceNumber}</p>
            <p className="text-sm text-slate-600">Date: {invoice.invoiceDate}</p>
            <p className="text-sm text-slate-600">Due: {invoice.dueDate}</p>
            <p className="text-sm text-slate-600">Job ref: {invoice.jobReference}</p>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-8">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bill To</h2>
            <div className="mt-2 space-y-1">
              {billLines.map((line, i) => (
                <p key={i} className={`text-sm ${i === 0 ? "font-semibold text-slate-900" : "text-slate-600"}`}>
                  {line}
                </p>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">From</h2>
            <div className="mt-2 space-y-1">
              {fromAddressLines.map((line, i) => (
                <p
                  key={i}
                  className={`text-sm ${i === 0 ? "font-semibold text-slate-900" : "text-slate-600"}`}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Unit Price</th>
                <th className="px-3 py-2 text-right font-semibold">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.length === 0 ? (
                <tr className="border-b border-slate-200">
                  <td className="px-3 py-3 text-slate-500" colSpan={4}>
                    No line items
                  </td>
                </tr>
              ) : (
                invoice.lineItems.map((line, idx) => (
                  <tr
                    key={line.id}
                    className={`border-b border-slate-200 ${
                      idx % 2 ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-700">{line.item || "Item"}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{line.qty}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{money(line.unitPrice)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{money(line.lineTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-8 ml-auto w-full max-w-xs space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>Subtotal</span>
            <span>{money(invoice.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>VAT ({invoice.vatRate}%)</span>
            <span>{money(invoice.vatAmount)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-300 pt-2 text-base font-bold text-slate-900">
            <span>Total</span>
            <span>{money(invoice.total)}</span>
          </div>
        </section>
        <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Thank you for your business.
        </footer>
      </div>
      <style jsx global>{`
        @media print {
          .invoice-toolbar {
            display: none !important;
          }
          .invoice-print-page {
            background: #fff !important;
            padding: 0 !important;
          }
          .invoice-card {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: none !important;
            width: 100% !important;
            min-height: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
