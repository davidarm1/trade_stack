import Link from "next/link";
import { getCurrentUserRole } from "@/lib/tenant";
import { getOutstandingDocuments, getAcceptanceStatus } from "@/actions/onboarding";
import { AcceptDocumentButton } from "./accept-document-button";

export default async function OnboardingPage() {
  const role = await getCurrentUserRole();
  const isManager = role === "owner" || role === "office";

  const { data: outstanding, error } = await getOutstandingDocuments();
  const statusResult = isManager ? await getAcceptanceStatus() : null;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Onboarding</h1>
          <p className="mt-1 text-sm text-slate-600">
            Staff acceptance forms — terms, handbook, and policies.
          </p>
        </div>
        {isManager && (
          <Link
            href="/onboarding/new"
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            New document
          </Link>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Outstanding for you
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {(outstanding ?? []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              You&apos;re all caught up — nothing outstanding.
            </p>
          ) : (
            (outstanding ?? []).map((doc) => (
              <div key={doc.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">
                      {doc.title}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        v{doc.version}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {doc.body}
                    </p>
                  </div>
                  <AcceptDocumentButton
                    documentId={doc.id}
                    version={doc.version}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isManager && statusResult?.data && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Sign-off status
            </h2>
          </div>
          {statusResult.data.documents.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              No required documents yet.
            </p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">
                    Staff member
                  </th>
                  {statusResult.data.documents.map((doc) => (
                    <th
                      key={doc.id}
                      className="px-4 py-3 text-left font-medium text-slate-700"
                    >
                      {doc.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statusResult.data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.name ?? u.email ?? "—"}
                    </td>
                    {statusResult.data.documents.map((doc) => {
                      const signed = statusResult.data.acceptedSet.has(
                        `${u.id}:${doc.id}:${doc.version}`,
                      );
                      return (
                        <td key={doc.id} className="px-4 py-3">
                          {signed ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Signed
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Outstanding
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
