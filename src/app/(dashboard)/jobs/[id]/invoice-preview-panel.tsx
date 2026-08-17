"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  replaceJobInvoiceMaterials,
  updateJob,
  updateJobCompletionDetails,
  updateJobInvoiceDetails,
} from "@/actions/jobs";
import { updateClient } from "@/actions/clients";
import { b2DownloadPathFromStoredValue } from "@/lib/b2-links";

type MaterialRow = {
  description: string;
  quantity: number;
  unit_price: number;
};

type Props = {
  jobId: string;
  currentInvoiceUrl: string | null;
  currentJobSheetUrl: string | null;
  invoiceVersions: Array<{
    id: string;
    version_no: number;
    reason: string | null;
    file_name: string;
    public_url: string;
    sent_to_email: string | null;
    is_current: boolean;
    created_at: string;
  }>;
  clientId: string | null;
  clientName: string;
  initial: {
    custom_invoice_number: string | null;
    custom_po_number: string | null;
    client_order_number: string | null;
    payment_terms_days: number | null;
    labour_charge: number | null;
    materials: MaterialRow[];
  };
  addressInitial: {
    billing_address1: string;
    billing_address2: string;
    billing_town: string;
    billing_postcode: string;
    site_address1: string;
    site_address2: string;
    site_town: string;
    site_postcode: string;
  };
  jobSheetInitial: {
    work_carried_out: string;
    parts_used: string;
    recommendations: string;
  };
};

const inputCls =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function InvoicePreviewPanel({
  jobId,
  currentInvoiceUrl,
  currentJobSheetUrl,
  invoiceVersions,
  clientId,
  clientName,
  initial,
  addressInitial,
  jobSheetInitial,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"invoice" | "jobsheet">("invoice");
  const [showEditor, setShowEditor] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [savedJobSheetUrl, setSavedJobSheetUrl] = useState(currentJobSheetUrl);
  const [fields, setFields] = useState({
    client_name: clientName,
    custom_invoice_number: initial.custom_invoice_number ?? "",
    custom_po_number: initial.custom_po_number ?? "",
    client_order_number: initial.client_order_number ?? "",
    payment_terms_days:
      initial.payment_terms_days != null ? String(initial.payment_terms_days) : "",
    labour_charge:
      initial.labour_charge != null ? String(initial.labour_charge) : "",
  });
  const [materials, setMaterials] = useState<MaterialRow[]>(
    initial.materials.length > 0
      ? initial.materials
      : [{ description: "", quantity: 1, unit_price: 0 }],
  );
  const [jobSheetFields, setJobSheetFields] = useState({
    work_carried_out: jobSheetInitial.work_carried_out,
    parts_used: jobSheetInitial.parts_used,
    recommendations: jobSheetInitial.recommendations,
  });
  const [addressFields, setAddressFields] = useState({
    billing_address1: addressInitial.billing_address1,
    billing_address2: addressInitial.billing_address2,
    billing_town: addressInitial.billing_town,
    billing_postcode: addressInitial.billing_postcode,
    site_address1: addressInitial.site_address1,
    site_address2: addressInitial.site_address2,
    site_town: addressInitial.site_town,
    site_postcode: addressInitial.site_postcode,
  });

  const previewUrl = useMemo(
    () => `/jobs/${jobId}/invoice?v=${version}`,
    [jobId, version],
  );
  const jobSheetPreviewUrl = useMemo(
    () => `/jobs/${jobId}/job-sheet?embed=1&v=${version}`,
    [jobId, version],
  );

  async function saveClientName() {
    if (busy || !clientId) return;
    setBusy("client_name");
    setMsg(null);
    const nextName = fields.client_name.trim() || clientName || "Client";
    const { error } = await updateClient(clientId, { company_name: nextName } as never);
    setBusy(null);
    if (error) {
      setMsg(error);
      return;
    }
    setMsg("Client name saved.");
    router.refresh();
  }

  async function saveField(
    key:
      | "custom_invoice_number"
      | "custom_po_number"
      | "client_order_number"
      | "payment_terms_days"
      | "labour_charge",
  ) {
    if (busy) return;
    setBusy(key);
    setMsg(null);
    const payload = {
      custom_invoice_number: fields.custom_invoice_number.trim() || null,
      custom_po_number: fields.custom_po_number.trim() || null,
      client_order_number: fields.client_order_number.trim() || null,
      payment_terms_days:
        fields.payment_terms_days.trim() === ""
          ? null
          : Number(fields.payment_terms_days),
      labour_charge:
        fields.labour_charge.trim() === "" ? null : Number(fields.labour_charge),
    };
    const { error } = await updateJobInvoiceDetails(jobId, payload);
    setBusy(null);
    if (error) {
      setMsg(error);
      return;
    }
    setVersion((v) => v + 1);
    setMsg("Saved.");
  }

  async function saveMaterials() {
    if (busy) return;
    setBusy("materials");
    setMsg(null);
    const { error } = await replaceJobInvoiceMaterials(jobId, materials);
    setBusy(null);
    if (error) {
      setMsg(error);
      return;
    }
    setVersion((v) => v + 1);
    setMsg("Materials saved.");
  }

  async function saveJobSheet() {
    if (busy) return;
    setBusy("jobsheet");
    setMsg(null);

    if (clientId) {
      const billingPayload = {
        company_name: fields.client_name.trim() || clientName || "Client",
        address1: addressFields.billing_address1.trim() || null,
        address2: addressFields.billing_address2.trim() || null,
        town: addressFields.billing_town.trim() || null,
        postcode: addressFields.billing_postcode.trim() || null,
      };
      const sitePayload = {
        site_address1: addressFields.site_address1.trim() || null,
        site_address2: addressFields.site_address2.trim() || null,
        site_town: addressFields.site_town.trim() || null,
        site_postcode: addressFields.site_postcode.trim() || null,
      };
      const [billingRes, siteRes] = await Promise.all([
        updateClient(clientId, billingPayload),
        updateJob(jobId, sitePayload),
      ]);
      if (billingRes.error || siteRes.error) {
        setBusy(null);
        setMsg(billingRes.error ?? siteRes.error);
        return;
      }
    }

    const { error } = await updateJobCompletionDetails(jobId, {
      work_carried_out: jobSheetFields.work_carried_out,
      parts_used: jobSheetFields.parts_used,
      recommendations: jobSheetFields.recommendations,
    });
    if (error) {
      setBusy(null);
      setMsg(error);
      return;
    }

    try {
      const res = await fetch(`/api/jobs/${jobId}/generate-jobsheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = (await res.json()) as { success?: boolean; url?: string; error?: string };
      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.error ?? "Could not create job sheet PDF");
      }
      setSavedJobSheetUrl(data.url);
      setVersion((v) => v + 1);
      setMsg("Job sheet saved and PDF created.");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Could not create job sheet PDF");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            setActiveTab("invoice");
            setMsg(null);
          }}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === "invoice"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Invoice
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("jobsheet");
            setMsg(null);
          }}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === "jobsheet"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Job Sheet
        </button>
      </div>

      {activeTab === "invoice" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() => setShowEditor((s) => !s)}
        >
          {showEditor ? "Hide invoice details" : "Edit invoice details"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          onClick={() => {
            const target = currentInvoiceUrl || `/jobs/${jobId}/invoice`;
            window.open(target, "_blank", "noopener,noreferrer");
          }}
        >
          Open invoice in new tab
        </button>
      </div>

      {showEditor ? (
        <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-600 sm:col-span-2">
            Client name
            <input
              className={inputCls}
              value={fields.client_name}
              onChange={(e) =>
                setFields((f) => ({ ...f, client_name: e.target.value }))
              }
              onBlur={() => void saveClientName()}
            />
          </label>
          <label className="text-xs text-slate-600">
              Invoice number
              <input
                className={inputCls}
                value={fields.custom_invoice_number}
                onChange={(e) =>
                  setFields((f) => ({ ...f, custom_invoice_number: e.target.value }))
                }
                onBlur={() => void saveField("custom_invoice_number")}
              />
            </label>
            <label className="text-xs text-slate-600">
              PO number
              <input
                className={inputCls}
                value={fields.custom_po_number}
                onChange={(e) =>
                  setFields((f) => ({ ...f, custom_po_number: e.target.value }))
                }
                onBlur={() => void saveField("custom_po_number")}
              />
            </label>
            <label className="text-xs text-slate-600">
              Client order number
              <input
                className={inputCls}
                value={fields.client_order_number}
                onChange={(e) =>
                  setFields((f) => ({ ...f, client_order_number: e.target.value }))
                }
                onBlur={() => void saveField("client_order_number")}
              />
            </label>
            <label className="text-xs text-slate-600">
              Payment terms (days)
              <input
                className={inputCls}
                type="number"
                min="0"
                value={fields.payment_terms_days}
                onChange={(e) =>
                  setFields((f) => ({ ...f, payment_terms_days: e.target.value }))
                }
                onBlur={() => void saveField("payment_terms_days")}
              />
            </label>
            <label className="text-xs text-slate-600 sm:col-span-2">
              Labour charge
              <input
                className={inputCls}
                type="number"
                min="0"
                step="0.01"
                value={fields.labour_charge}
                onChange={(e) =>
                  setFields((f) => ({ ...f, labour_charge: e.target.value }))
                }
                onBlur={() => void saveField("labour_charge")}
              />
            </label>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700">Line items</p>
            <div className="mt-2 space-y-2">
              {materials.map((m, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <input
                    className={`${inputCls} col-span-6`}
                    placeholder="Item"
                    value={m.description}
                    onChange={(e) =>
                      setMaterials((list) =>
                        list.map((row, i) =>
                          i === idx ? { ...row, description: e.target.value } : row,
                        ),
                      )
                    }
                    onBlur={() => void saveMaterials()}
                  />
                  <input
                    className={`${inputCls} col-span-2`}
                    placeholder="Qty"
                    type="number"
                    min="0"
                    step="0.01"
                    value={String(m.quantity)}
                    onChange={(e) =>
                      setMaterials((list) =>
                        list.map((row, i) =>
                          i === idx
                            ? { ...row, quantity: Number(e.target.value || 0) }
                            : row,
                        ),
                      )
                    }
                    onBlur={() => void saveMaterials()}
                  />
                  <input
                    className={`${inputCls} col-span-3`}
                    placeholder="Unit price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={String(m.unit_price)}
                    onChange={(e) =>
                      setMaterials((list) =>
                        list.map((row, i) =>
                          i === idx
                            ? { ...row, unit_price: Number(e.target.value || 0) }
                            : row,
                        ),
                      )
                    }
                    onBlur={() => void saveMaterials()}
                  />
                  <button
                    type="button"
                    className="col-span-1 rounded-md border border-red-200 bg-white px-2 text-red-700 hover:bg-red-50"
                    onClick={() => {
                      setMaterials((list) => list.filter((_, i) => i !== idx));
                      setTimeout(() => void saveMaterials(), 0);
                    }}
                    title="Remove line"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              onClick={() =>
                setMaterials((list) => [
                  ...list,
                  { description: "", quantity: 1, unit_price: 0 },
                ])
              }
            >
              Add line item
            </button>
          </div>
        </div>
      ) : null}

      {msg ? (
        <p className="mt-2 text-xs text-slate-600">
          {busy ? "Saving..." : msg}
        </p>
      ) : null}

      <div className="mt-4 h-[600px] w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100 p-3 shadow-sm">
        <div className="h-full w-full origin-top-left scale-[0.75]">
          <iframe
            title="Invoice preview"
            src={previewUrl}
            className="h-[800px] w-[133.3333%] rounded border border-slate-300 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)]"
          />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-900">Stored invoice versions</h3>
        {invoiceVersions.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            No stored invoice PDF yet. Click &quot;Send Invoice&quot; to create v1.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {invoiceVersions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium text-slate-800">
                    v{v.version_no} {v.is_current ? "· Current" : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(v.created_at).toLocaleString("en-GB")}
                    {v.reason ? ` · ${v.reason}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    Sent to: {v.sent_to_email?.trim() || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <a
                    href={b2DownloadPathFromStoredValue(v.public_url) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                  >
                    View
                  </a>
                  <a
                    href={b2DownloadPathFromStoredValue(v.public_url) ?? "#"}
                    download={v.file_name}
                    className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                  >
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => setShowEditor((s) => !s)}
            >
              {showEditor ? "Hide job sheet details" : "Edit job sheet details"}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => {
                const target = savedJobSheetUrl || jobSheetPreviewUrl;
                window.open(target, "_blank", "noopener,noreferrer");
              }}
            >
              Open job sheet in new tab
            </button>
            <button
              type="button"
              disabled={busy === "jobsheet"}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
              onClick={() => void saveJobSheet()}
            >
              {busy === "jobsheet" ? "Saving..." : "Save changes and create job sheet PDF"}
            </button>
          </div>

          {showEditor ? (
            <div className="mt-3 space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Address details
                </h4>
                <div className="mt-2 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Billing address
                    </p>
                    <div className="mt-2 space-y-2">
                      <input
                        className={inputCls}
                        placeholder="Address line 1"
                        value={addressFields.billing_address1}
                        onChange={(e) =>
                          setAddressFields((f) => ({ ...f, billing_address1: e.target.value }))
                        }
                      />
                      <input
                        className={inputCls}
                        placeholder="Address line 2"
                        value={addressFields.billing_address2}
                        onChange={(e) =>
                          setAddressFields((f) => ({ ...f, billing_address2: e.target.value }))
                        }
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          className={inputCls}
                          placeholder="Town"
                          value={addressFields.billing_town}
                          onChange={(e) =>
                            setAddressFields((f) => ({ ...f, billing_town: e.target.value }))
                          }
                        />
                        <input
                          className={inputCls}
                          placeholder="Postcode"
                          value={addressFields.billing_postcode}
                          onChange={(e) =>
                            setAddressFields((f) => ({ ...f, billing_postcode: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Site address
                    </p>
                    <div className="mt-2 space-y-2">
                      <input
                        className={inputCls}
                        placeholder="Address line 1"
                        value={addressFields.site_address1}
                        onChange={(e) =>
                          setAddressFields((f) => ({ ...f, site_address1: e.target.value }))
                        }
                      />
                      <input
                        className={inputCls}
                        placeholder="Address line 2"
                        value={addressFields.site_address2}
                        onChange={(e) =>
                          setAddressFields((f) => ({ ...f, site_address2: e.target.value }))
                        }
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          className={inputCls}
                          placeholder="Town"
                          value={addressFields.site_town}
                          onChange={(e) =>
                            setAddressFields((f) => ({ ...f, site_town: e.target.value }))
                          }
                        />
                        <input
                          className={inputCls}
                          placeholder="Postcode"
                          value={addressFields.site_postcode}
                          onChange={(e) =>
                            setAddressFields((f) => ({ ...f, site_postcode: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Job sheet notes
                </h4>
                <div className="mt-2 space-y-3">
                  <label className="block text-xs text-slate-600">
                    Work carried out
                    <textarea
                      className={`${inputCls} mt-1 min-h-28`}
                      value={jobSheetFields.work_carried_out}
                      onChange={(e) =>
                        setJobSheetFields((f) => ({
                          ...f,
                          work_carried_out: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="block text-xs text-slate-600">
                    Parts used
                    <textarea
                      className={`${inputCls} mt-1 min-h-20`}
                      value={jobSheetFields.parts_used}
                      onChange={(e) =>
                        setJobSheetFields((f) => ({ ...f, parts_used: e.target.value }))
                      }
                    />
                  </label>
                  <label className="block text-xs text-slate-600">
                    Recommendations
                    <textarea
                      className={`${inputCls} mt-1 min-h-20`}
                      value={jobSheetFields.recommendations}
                      onChange={(e) =>
                        setJobSheetFields((f) => ({ ...f, recommendations: e.target.value }))
                      }
                    />
                  </label>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Saving updates the client billing address, the job site address, the office copy of the engineer notes, and the stored PDF job sheet.
              </p>
            </div>
          ) : null}

          {msg ? (
            <p className="mt-2 text-xs text-slate-600">
              {busy ? "Saving..." : msg}
            </p>
          ) : null}

          <div className="mt-4 h-[600px] w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100 p-3 shadow-sm">
            <div className="h-full w-full origin-top-left scale-[0.75]">
              <iframe
                title="Job sheet preview"
                src={jobSheetPreviewUrl}
                className="h-[800px] w-[133.3333%] rounded border border-slate-300 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)]"
              />
            </div>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Stored job sheet
            </h3>
            {savedJobSheetUrl ? (
              <a
                href={savedJobSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                View stored PDF
              </a>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                No stored job sheet PDF yet. Click &quot;Save and create job
                sheet PDF&quot; to create one.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
