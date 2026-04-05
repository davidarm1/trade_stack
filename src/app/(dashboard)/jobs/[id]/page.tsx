import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/actions/jobs";
import { JobDetailActions } from "./job-detail-actions";

export default async function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { data, error } = await getJob(params.id);

  if (error || !data) {
    notFound();
  }

  const { job, materials, completion, images } = data;
  const j = job as Record<string, unknown> & {
    id: string;
    title?: string | null;
    engineer?: { name?: string | null; email?: string | null } | null;
    clients?: Record<string, unknown> | null;
  };

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
          <h1 className="text-2xl font-semibold text-slate-900">
            {String(j.title ?? "Job")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Status: {String(j.status ?? "—")} · Payment:{" "}
            {String(j.payment_status ?? "—")}
          </p>
        </div>
        <JobDetailActions jobId={j.id} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Client</dt>
              <dd className="text-slate-900">
                {j.clients && typeof j.clients === "object" && "company_name" in j.clients
                  ? String((j.clients as { company_name?: string }).company_name ?? "—")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Engineer</dt>
              <dd className="text-slate-900">
                {j.engineer?.name ?? "—"}{" "}
                {j.engineer?.email ? (
                  <span className="text-slate-500">
                    ({j.engineer.email})
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Site</dt>
              <dd className="text-slate-900">
                {[j.site_address1, j.site_address2, j.site_town, j.site_postcode]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Labour charge</dt>
              <dd className="text-slate-900">{String(j.labour_charge ?? "—")}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Invoice</dt>
              <dd className="text-slate-900">
                Sent: {j.invoice_sent_at ? String(j.invoice_sent_at) : "—"} · Paid:{" "}
                {j.invoice_paid_at ? String(j.invoice_paid_at) : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
            {String(j.description ?? "")}
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Materials</h2>
          {materials.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No line items yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {materials.map((m: { id: string; description?: string | null; quantity?: number | null; total_price?: number | null }) => (
                <li key={m.id} className="py-2 flex justify-between gap-4">
                  <span>{m.description ?? "Item"}</span>
                  <span className="tabular-nums text-slate-600">
                    {m.quantity ?? 0} × {String(m.total_price ?? "—")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Completion</h2>
        {!completion ? (
          <p className="mt-2 text-sm text-slate-500">No completion submitted.</p>
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
              {String((completion as { parts_used?: string | null }).parts_used ?? "—")}
            </p>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Images</h2>
        {images.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No images uploaded.</p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
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
                    className="text-sm text-slate-900 underline"
                  >
                    {im.image_name ?? "Image"}
                  </a>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
