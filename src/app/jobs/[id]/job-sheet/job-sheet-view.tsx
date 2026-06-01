"use client";

export type JobSheetViewProps = {
  embed?: boolean;
  jobRef: string;
  companyName: string | null;
  companyDetailLines: string[];
  companyLogoUrl: string | null;
  brandingShowLogo: boolean;
  brandingShowCompanyName: boolean;
  clientName: string;
  siteLines: string[];
  contactName: string | null;
  contactNumber: string | null;
  dateOnSite: string | null;
  timeOnSite: string | null;
  engineerName: string | null;
  status: string | null;
  poNumber: string | null;
  jobDescription: string | null;
  workCarriedOut: string | null;
  partsUsed: string | null;
  recommendations: string | null;
  materials: Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    totalPrice: number | null;
  }>;
  labourCharge: number | null;
  totalMaterials: number | null;
  printName: string | null;
  signatureUrl: string | null;
  signedAt: string | null;
  startTime: string | null;
  finishTime: string | null;
};

function fmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function JobSheetView(props: JobSheetViewProps) {
  const {
    embed,
    jobRef,
    companyName,
    companyDetailLines,
    companyLogoUrl,
    brandingShowLogo,
    brandingShowCompanyName,
    clientName,
    siteLines,
    contactName,
    contactNumber,
    dateOnSite,
    timeOnSite,
    engineerName,
    status,
    poNumber,
    jobDescription,
    workCarriedOut,
    partsUsed,
    recommendations,
    materials,
    labourCharge,
    totalMaterials,
    printName,
    signatureUrl,
    signedAt,
    startTime,
    finishTime,
  } = props;

  const metaRows: [string, string | null][] = [
    ["Date on site", dateOnSite],
    ["Time", timeOnSite],
    ["Engineer", engineerName],
    ["Status", status],
    ["PO / Order No", poNumber],
  ].filter(([, v]) => v != null) as [string, string][];

  const hasMaterials = materials.length > 0;
  const hasFinancials = labourCharge != null || totalMaterials != null;

  return (
    <div className="jobsheet-print-page min-h-screen bg-[#f3f4f6] px-4 py-8 print:bg-white print:p-0">
      {!embed ? (
        <div className="jobsheet-toolbar fixed right-4 top-4 z-50 flex gap-2 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur-sm print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Print
          </button>
        </div>
      ) : null}

      <div className="jobsheet-card mx-auto w-full max-w-[794px] min-h-[1123px] rounded-md bg-white p-10 shadow-[0_10px_25px_rgba(15,23,42,0.12)] print:max-w-none print:min-h-0 print:rounded-none print:p-0 print:shadow-none">

        {/* ── Header ── */}
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
            {brandingShowCompanyName && companyName ? (
              <p className="text-sm font-semibold text-[#E8763D]">{companyName}</p>
            ) : null}
            {companyDetailLines.map((line, i) => (
              <p key={i} className="text-sm text-slate-600">{line}</p>
            ))}
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-bold tracking-wide text-[#1a2e4a]">JOB SHEET</h1>
            <p className="mt-2 font-mono text-sm font-semibold text-[#1a2e4a]">{jobRef}</p>
          </div>
        </header>

        {/* ── Client / Job meta ── */}
        <section className="mt-6 grid grid-cols-2 gap-8 border-b border-slate-200 pb-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1a2e4a]">Client</h2>
            <div className="mt-2 space-y-1">
              <p className="text-sm font-semibold text-slate-900">{clientName || "—"}</p>
              {siteLines.map((line, i) => (
                <p key={i} className="text-sm text-slate-600">{line}</p>
              ))}
              {contactName ? (
                <p className="text-sm text-slate-600">Contact: {contactName}</p>
              ) : null}
              {contactNumber ? (
                <p className="text-sm text-slate-600">Tel: {contactNumber}</p>
              ) : null}
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1a2e4a]">Job Details</h2>
            <dl className="mt-2 space-y-1">
              {metaRows.map(([label, value]) => (
                <div key={label} className="flex gap-2 text-sm">
                  <dt className="w-28 shrink-0 font-medium text-[#1a2e4a]">{label}:</dt>
                  <dd className="text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Job description ── */}
        {jobDescription ? (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1a2e4a]">Job Description</h2>
            <div className="mt-1 h-px bg-slate-200" />
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{jobDescription}</p>
          </section>
        ) : null}

        {/* ── Work carried out ── */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1a2e4a]">Work Carried Out</h2>
          <div className="mt-1 h-px bg-slate-200" />
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
            {workCarriedOut || "No completion notes recorded."}
          </p>
        </section>

        {/* ── Parts used ── */}
        {partsUsed ? (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1a2e4a]">Parts Used</h2>
            <div className="mt-1 h-px bg-slate-200" />
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{partsUsed}</p>
          </section>
        ) : null}

        {/* ── Recommendations ── */}
        {recommendations ? (
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1a2e4a]">Recommendations</h2>
            <div className="mt-1 h-px bg-slate-200" />
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{recommendations}</p>
          </section>
        ) : null}

        {/* ── Materials & labour table ── */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1a2e4a]">Materials &amp; Labour</h2>
          <div className="mt-1 h-px bg-slate-200" />
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#1a2e4a] text-white">
                <th className="px-3 py-2 text-left font-semibold">Description</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Unit Price</th>
                <th className="px-3 py-2 text-right font-semibold">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {!hasMaterials ? (
                <tr className="border-b border-slate-200">
                  <td className="px-3 py-3 text-slate-500" colSpan={4}>No materials recorded</td>
                </tr>
              ) : (
                materials.map((m, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-slate-200 ${idx % 2 ? "bg-slate-50" : "bg-white"}`}
                  >
                    <td className="px-3 py-2 text-slate-700">{m.description || "—"}</td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {m.quantity != null ? m.quantity : ""}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {m.unitPrice != null ? fmt(m.unitPrice) : ""}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {m.totalPrice != null ? fmt(m.totalPrice) : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {hasFinancials ? (
            <div className="mt-2 flex gap-6 text-sm font-semibold text-[#1a2e4a]">
              {labourCharge != null ? <span>Labour: {fmt(labourCharge)}</span> : null}
              {totalMaterials != null ? <span>Materials: {fmt(totalMaterials)}</span> : null}
            </div>
          ) : null}
        </section>

        {/* ── Signature ── */}
        <section className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#1a2e4a]">Client Signature</h2>
          <div className="mt-1 h-px bg-slate-200" />
          <div className="mt-4 space-y-2 text-sm text-slate-700">
            {(startTime || finishTime) ? (
              <p>
                Time on site:{" "}
                {[startTime, finishTime].filter(Boolean).join(" – ")}
              </p>
            ) : null}
            {printName ? <p>Name: {printName}</p> : null}
          </div>
          <div className="mt-3 flex h-24 w-full items-center justify-center rounded border-2 border-slate-300 bg-slate-50">
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt="Client signature"
                className="max-h-20 max-w-full object-contain"
              />
            ) : (
              <span className="text-sm text-slate-400">No signature captured</span>
            )}
          </div>
          {signedAt ? (
            <p className="mt-2 text-xs text-slate-500">
              Signed{" "}
              {new Date(signedAt).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          ) : null}
        </section>
      </div>

      <style jsx global>{`
        @media print {
          .jobsheet-toolbar { display: none !important; }
          .jobsheet-print-page { background: #fff !important; padding: 0 !important; }
          .jobsheet-card {
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
