import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob, getJobInvoiceVersions } from "@/actions/jobs";
import { getTeamMembers } from "@/actions/team";
import { formatCurrency } from "@/lib/format-currency";
import { getTenantCurrencyCode } from "@/lib/tenant-currency";
import {
  formatJobRefFormal,
  jobInvoiceEmailSubject,
} from "@/lib/job-number";
import { JobDetailActions } from "./job-detail-actions";
import { InvoicePreviewPanel } from "./invoice-preview-panel";

const CURRENCY_TO_LOCALE: Record<string, string> = {
  GBP: "en-GB",
  EUR: "en-IE",
  USD: "en-US",
  CAD: "en-CA",
  AUD: "en-AU",
  NZD: "en-NZ",
};

function localeFromCurrency(currencyCode: string): string {
  const code = String(currencyCode || "").trim().toUpperCase();
  return CURRENCY_TO_LOCALE[code] ?? "en-GB";
}

function formatDateOnly(value: unknown, locale: string): string {
  if (!value) return "—";
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(dt);
}

function formatDateTime(value: unknown, locale: string): string {
  if (!value) return "—";
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { data, error } = await getJob(id);
  if (error || !data) return { title: "Job" };
  const j = data.job as { title?: string | null; job_number?: number | null };
  const ref = formatJobRefFormal(j.job_number) || "Job";
  const titleBit = (j.title ?? "Job").slice(0, 80);
  return { title: `${ref} · ${titleBit}` };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data, error }, teamRes, invoiceVersionsRes] = await Promise.all([
    getJob(id),
    getTeamMembers(),
    getJobInvoiceVersions(id),
  ]);
  const invoiceVersions = invoiceVersionsRes.data ?? [];
  const currentInvoiceVersion = invoiceVersions.find((v) => v.is_current) ?? null;

  if (error || !data) {
    notFound();
  }

  const currencyCode = await getTenantCurrencyCode();
  const { job, materials, completion, images, receipts } = data;
  const j = job as Record<string, unknown> & {
    id: string;
    job_number?: number | null;
    legacy_ref?: string | null;
    custom_po_number?: string | null;
    title?: string | null;
    status?: string | null;
    payment_status?: string | null;
    description?: string | null;
    site_address1?: string | null;
    site_address2?: string | null;
    site_town?: string | null;
    site_postcode?: string | null;
    labour_charge?: number | null;
    total_materials?: number | null;
    subtotal?: number | null;
    vat_amount?: number | null;
    total_inc_vat?: number | null;
    payment_terms_days?: number | null;
    invoice_sent_to_email?: string | null;
    custom_invoice_number?: string | null;
    client_order_number?: string | null;
    date_onsite?: string | null;
    time_onsite?: string | null;
    sent_to_engineer_at?: string | null;
    received_from_engineer_at?: string | null;
    approved_at?: string | null;
    invoice_sent_at?: string | null;
    invoice_paid_at?: string | null;
    jobsheet_url?: string | null;
    signature_url?: string | null;
    signed_at?: string | null;
    engineer?: { name?: string | null; email?: string | null } | null;
    clients?: Record<string, unknown> | null;
  };

  const jobNo = j.job_number ?? null;
  const legacy = String(j.legacy_ref ?? "").trim();
  const titleStr = String(j.title ?? "Job");
  const jobRef = formatJobRefFormal(jobNo) || "—";
  const plainJobNo = jobNo == null ? "—" : String(jobNo);
  const clientName =
    j.clients && typeof j.clients === "object" && "company_name" in j.clients
      ? String((j.clients as { company_name?: string }).company_name ?? "—")
      : "—";
  const initialInvoiceRecipients = (() => {
    const fromJob = String(j.invoice_sent_to_email ?? "").trim();
    if (fromJob) return fromJob;
    const fromClient =
      j.clients &&
      typeof j.clients === "object" &&
      "contact_email" in j.clients
        ? String((j.clients as { contact_email?: string | null }).contact_email ?? "").trim()
        : "";
    return fromClient;
  })();
  const engineers =
    teamRes.error || !teamRes.data
      ? []
      : teamRes.data
          .filter(
            (u: { role?: string; is_active?: boolean }) =>
              u.is_active !== false &&
              (u.role === "engineer" || u.role === "owner" || u.role === "office"),
          )
          .map((u: { id: string; name: string | null; email?: string | null }) => ({
            id: u.id,
            name: u.name ?? u.email ?? u.id,
          }));
  const siteAddress =
    [j.site_address1, j.site_address2, j.site_town, j.site_postcode]
      .filter(Boolean)
      .join(", ") || "—";

  const money = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n)
      ? formatCurrency(n, currencyCode)
      : "—";
  const locale = localeFromCurrency(currencyCode);
  const completionSignatureUrl =
    completion &&
    typeof (completion as { client_signature_url?: unknown }).client_signature_url ===
      "string"
      ? String((completion as { client_signature_url?: string }).client_signature_url).trim()
      : "";
  const signatureUrl = String(j.signature_url ?? "").trim() || completionSignatureUrl;

  return (
    <div>
      <Link
        href="/jobs"
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to jobs
      </Link>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-sm font-medium text-slate-600">
            {legacy ? (
              <span
                className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-amber-800"
                title="Legacy Job Number"
              >
                Legacy {legacy}
              </span>
            ) : null}
          </p>
          <p className="mt-2 font-mono text-sm font-medium text-slate-700">
            {jobRef}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {titleStr}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Status: {String(j.status ?? "—")} · Payment:{" "}
            {String(j.payment_status ?? "—")}
          </p>
        </div>
        <JobDetailActions
          jobId={j.id}
          jobNumber={jobNo}
          jobTitle={titleStr}
          assignedEngineerId={
            typeof j.assigned_engineer_id === "string"
              ? j.assigned_engineer_id
              : null
          }
          sentToEngineerAt={j.sent_to_engineer_at ?? null}
          receivedFromEngineerAt={
            typeof j.received_from_engineer_at === "string"
              ? j.received_from_engineer_at
              : null
          }
          signedAt={typeof j.signed_at === "string" ? j.signed_at : null}
          approvedAt={j.approved_at ?? null}
          invoiceSentAt={j.invoice_sent_at ?? null}
          invoiceVersionCount={invoiceVersions.length}
          initialInvoiceRecipients={initialInvoiceRecipients}
          isPaid={String(j.payment_status ?? "").toLowerCase() === "paid"}
          engineers={engineers}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Job</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Job number</dt>
                <dd className="font-mono text-slate-900">{plainJobNo}</dd>
              </div>
              {legacy ? (
                <div>
                  <dt className="text-slate-500">Legacy ref</dt>
                  <dd
                    className="font-mono text-amber-700"
                    title="Legacy Job Number"
                  >
                    {legacy}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="text-slate-900">{String(j.status ?? "—")}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Payment status</dt>
                <dd className="text-slate-900">
                  {String(j.payment_status ?? "—")}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Date onsite</dt>
                <dd className="text-slate-900">
                  {formatDateOnly(j.date_onsite, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Time onsite</dt>
                <dd className="text-slate-900">
                  {String(j.time_onsite ?? "—")}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
              {String(j.description ?? "")}
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Client & Site
            </h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Client</dt>
                <dd className="text-slate-900">{clientName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Engineer</dt>
                <dd className="text-slate-900">
                  {j.engineer?.name ?? "—"}{" "}
                  {j.engineer?.email ? (
                    <span className="text-slate-500">({j.engineer.email})</span>
                  ) : null}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Site</dt>
                <dd className="text-slate-900">{siteAddress}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Financial</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">PO number</dt>
                <dd className="text-slate-900">
                  {j.custom_po_number?.trim()
                    ? String(j.custom_po_number)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Client order number</dt>
                <dd className="text-slate-900">
                  {j.client_order_number?.trim()
                    ? String(j.client_order_number)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Labour charge</dt>
                <dd className="text-slate-900">{money(j.labour_charge)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Total materials</dt>
                <dd className="text-slate-900">{money(j.total_materials)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="text-slate-900">{money(j.subtotal)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">VAT amount</dt>
                <dd className="text-slate-900">{money(j.vat_amount)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Total inc VAT</dt>
                <dd className="text-slate-900">{money(j.total_inc_vat)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Payment terms (days)</dt>
                <dd className="text-slate-900">
                  {String(j.payment_terms_days ?? "—")}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Invoice & Workflow
            </h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Custom invoice number</dt>
                <dd className="text-slate-900">
                  {j.custom_invoice_number?.trim()
                    ? String(j.custom_invoice_number)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Invoice sent to</dt>
                <dd className="text-slate-900">
                  {j.invoice_sent_to_email?.trim()
                    ? String(j.invoice_sent_to_email)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Invoice sent at</dt>
                <dd className="text-slate-900">
                  {formatDateTime(j.invoice_sent_at, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Invoice paid at</dt>
                <dd className="text-slate-900">
                  {formatDateTime(j.invoice_paid_at, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Sent to engineer</dt>
                <dd className="text-slate-900">
                  {formatDateTime(j.sent_to_engineer_at, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Received from engineer</dt>
                <dd className="text-slate-900">
                  {formatDateTime(j.received_from_engineer_at, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Approved at</dt>
                <dd className="text-slate-900">
                  {formatDateTime(j.approved_at, locale)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Suggested email subject</dt>
                <dd className="text-slate-900">
                  {jobInvoiceEmailSubject({
                    jobNumber: jobNo,
                    title: titleStr,
                  })}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <InvoicePreviewPanel
          jobId={j.id}
          currentInvoiceUrl={currentInvoiceVersion?.public_url ?? null}
          currentJobSheetUrl={j.jobsheet_url ?? null}
          invoiceVersions={invoiceVersions}
          initial={{
            custom_invoice_number: j.custom_invoice_number ?? null,
            custom_po_number: j.custom_po_number ?? null,
            client_order_number: j.client_order_number ?? null,
            payment_terms_days:
              typeof j.payment_terms_days === "number"
                ? j.payment_terms_days
                : null,
            labour_charge:
              typeof j.labour_charge === "number" ? j.labour_charge : null,
            materials: materials.map(
              (m: {
                description?: string | null;
                quantity?: number | null;
                unit_price?: number | null;
              }) => ({
                description: String(m.description ?? ""),
                quantity:
                  typeof m.quantity === "number" && Number.isFinite(m.quantity)
                    ? m.quantity
                    : 1,
                unit_price:
                  typeof m.unit_price === "number" &&
                  Number.isFinite(m.unit_price)
                    ? m.unit_price
                    : 0,
              }),
            ),
          }}
          jobSheetInitial={{
            work_carried_out: String(
              (completion as { work_carried_out?: string | null } | null)
                ?.work_carried_out ?? "",
            ),
            parts_used: String(
              (completion as { parts_used?: string | null } | null)?.parts_used ??
                "",
            ),
          }}
        />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Materials</h2>
        {materials.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No line items yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {materials.map(
              (m: {
                id: string;
                description?: string | null;
                quantity?: number | null;
                total_price?: number | null;
              }) => (
                <li key={m.id} className="py-2 flex justify-between gap-4">
                  <span>{m.description ?? "Item"}</span>
                  <span className="tabular-nums text-slate-600">
                    {m.quantity ?? 0} ×{" "}
                    {typeof m.total_price === "number" &&
                    Number.isFinite(m.total_price)
                      ? formatCurrency(m.total_price, currencyCode)
                      : "—"}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Linked receipts / materials costs
        </h2>
        {receipts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No receipts have been scanned from this job sheet yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {receipts.map(
              (receipt: {
                id: string;
                receipt_url?: string | null;
                supplier_name?: string | null;
                invoice_date?: string | null;
                amount_total?: number | null;
                currency?: string | null;
                uploaded_by_id?: string | null;
                created_at?: string | null;
              }) => {
                const amount =
                  typeof receipt.amount_total === "number" &&
                  Number.isFinite(receipt.amount_total)
                    ? formatCurrency(
                        receipt.amount_total,
                        receipt.currency ?? currencyCode,
                      )
                    : "Pending OCR";
                const label = receipt.supplier_name?.trim() || "Receipt";
                const detail = [
                  formatDateOnly(receipt.invoice_date, locale),
                  amount,
                  receipt.created_at
                    ? `scanned ${formatDateTime(receipt.created_at, locale)}`
                    : null,
                ]
                  .filter((part) => part && part !== "—")
                  .join(" · ");

                return (
                  <li key={receipt.id} className="py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{label}</p>
                        {detail ? (
                          <p className="text-slate-500">{detail}</p>
                        ) : null}
                      </div>
                      {receipt.receipt_url ? (
                        <a
                          href={receipt.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-slate-700 underline"
                        >
                          View receipt
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              },
            )}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Completion</h2>
        {!completion ? (
          signatureUrl ? null : (
            <p className="mt-2 text-sm text-slate-500">
              No completion submitted.
            </p>
          )
        ) : (
          <div className="mt-2 text-sm text-slate-700 space-y-2">
            <p className="whitespace-pre-wrap">
              {String(
                (completion as { work_carried_out?: string | null })
                  .work_carried_out ?? "",
              )}
            </p>
            <p className="text-slate-500">
              Parts:{" "}
              {String(
                (completion as { parts_used?: string | null }).parts_used ??
                  "—",
              )}
            </p>
          </div>
        )}
        {signatureUrl ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-900">
              Client signature
            </p>
            <a href={signatureUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="Client signature"
                className="mt-2 max-h-32 w-auto rounded border border-slate-200 bg-white p-2"
              />
            </a>
            {j.signed_at ? (
              <p className="mt-2 text-xs text-slate-500">
                Signed {formatDateTime(j.signed_at, locale)}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Work photos</h2>
        {images.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No engineer photos uploaded.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-500">
              Engineer-uploaded photos from the job. Click any thumbnail to view
              the full-size image.
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {images.map(
                (im: {
                  id: string;
                  image_url: string;
                  image_name?: string | null;
                }) => (
                  <li key={im.id}>
                    <a
                      href={im.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="group block overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={im.image_url}
                        alt={im.image_name ?? "Engineer job photo"}
                        loading="lazy"
                        decoding="async"
                        className="aspect-video w-full object-cover transition group-hover:scale-[1.02]"
                      />
                      <span className="block truncate bg-white px-3 py-2 text-sm font-medium text-slate-700 group-hover:underline">
                        {im.image_name ?? "View full-size photo"}
                      </span>
                    </a>
                  </li>
                ),
              )}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
