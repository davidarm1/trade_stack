import Link from "next/link";
import { getClients } from "@/actions/clients";
import { getTeamMembers } from "@/actions/team";
import { NewJobForm } from "./new-job-form";

export default async function NewJobPage() {
  const [clientsRes, teamRes] = await Promise.all([
    getClients(),
    getTeamMembers(),
  ]);

  if (clientsRes.error || teamRes.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {clientsRes.error ?? teamRes.error}
      </div>
    );
  }

  const clients = (clientsRes.data ?? []).map((c: { id: string; company_name: string }) => ({
    id: c.id,
    company_name: c.company_name,
  }));

  const engineers = (teamRes.data ?? []).filter(
    (u: { role?: string; is_active?: boolean }) =>
      u.is_active !== false &&
      (u.role === "engineer" ||
        u.role === "owner" ||
        u.role === "office"),
  );

  return (
    <div>
      <Link
        href="/jobs"
        className="text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        ← Back to jobs
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">New job</h1>
      <p className="mt-1 text-sm text-slate-600">
        Create a job for a client and optionally assign an engineer.
      </p>
      <NewJobForm clients={clients} engineers={engineers} />
    </div>
  );
}
