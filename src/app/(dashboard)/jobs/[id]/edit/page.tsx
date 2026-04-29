import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/actions/jobs";
import { getTeamMembers } from "@/actions/team";
import { EditJobForm } from "./edit-job-form";

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [jobRes, teamRes] = await Promise.all([getJob(id), getTeamMembers()]);

  if (jobRes.error || !jobRes.data) notFound();
  if (teamRes.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {teamRes.error}
      </div>
    );
  }

  const engineers = (teamRes.data ?? [])
    .filter(
      (u: { role?: string; is_active?: boolean }) =>
        u.is_active !== false &&
        (u.role === "engineer" || u.role === "owner" || u.role === "office"),
    )
    .map((u: { id: string; name: string | null }) => ({
      id: u.id,
      name: u.name,
    }));

  const job = jobRes.data.job as {
    id: string;
    title: string | null;
    description: string | null;
    job_type: string | null;
    status: string | null;
    assigned_engineer_id: string | null;
    date_onsite: string | null;
    site_address1: string | null;
    site_address2: string | null;
    site_town: string | null;
    site_postcode: string | null;
    labour_charge: number | null;
    payment_terms_days: number | null;
    custom_po_number: string | null;
    legacy_ref: string | null;
    job_number: number | null;
    invoice_sent_at: string | null;
  };

  return (
    <div>
      <Link
        href={`/jobs/${job.id}`}
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to job
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        Edit job {job.job_number != null ? `#${job.job_number}` : ""}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Update key job details and save changes.
      </p>

      <EditJobForm
        initial={{
          id: job.id,
          title: job.title,
          description: job.description,
          job_type: job.job_type,
          status: job.status,
          assigned_engineer_id: job.assigned_engineer_id,
          date_onsite: job.date_onsite,
          site_address1: job.site_address1,
          site_address2: job.site_address2,
          site_town: job.site_town,
          site_postcode: job.site_postcode,
          labour_charge: job.labour_charge,
          payment_terms_days: job.payment_terms_days,
          custom_po_number: job.custom_po_number,
          legacy_ref: job.legacy_ref,
          invoice_sent_at: job.invoice_sent_at,
        }}
        engineers={engineers}
      />
    </div>
  );
}
