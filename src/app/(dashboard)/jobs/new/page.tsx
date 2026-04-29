import Link from "next/link";
import { getTeamMembers } from "@/actions/team";
import { NewJobEntry } from "./new-job-entry";

export default async function NewJobPage() {
  const teamRes = await getTeamMembers();

  if (teamRes.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {teamRes.error}
      </div>
    );
  }

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
        Add a job for a client — enter details yourself, or paste a client message
        to parse with OpenAI (set OPENAI_API_KEY for the app server).
      </p>
      <NewJobEntry engineers={engineers} />
    </div>
  );
}
