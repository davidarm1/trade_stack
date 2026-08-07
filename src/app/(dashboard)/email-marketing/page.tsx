import Link from "next/link";
import { getEmailTemplates, getCampaigns } from "@/actions/email-marketing";

type CampaignRow = {
  id: string;
  audience: string;
  sent_at: string | null;
  template: { name: string } | null;
  sends: { status: string }[];
};

export default async function EmailMarketingPage() {
  const [{ data: templates, error: templatesErr }, { data: campaigns, error: campaignsErr }] =
    await Promise.all([getEmailTemplates(), getCampaigns()]);

  const error = templatesErr ?? campaignsErr;
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
          <h1 className="text-2xl font-semibold text-slate-900">
            Email Marketing
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Templates and campaigns — sent individually, one email per
            recipient. Clients only receive email if they&apos;ve opted in.
          </p>
        </div>
        <Link
          href="/email-marketing/new"
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New template
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Templates</h2>
        </div>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Subject
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(templates ?? []).length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                  No templates yet. Add one to get started.
                </td>
              </tr>
            ) : (
              (templates ?? []).map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/email-marketing/${t.id}`}
                      className="hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{t.subject}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Recent campaigns
          </h2>
        </div>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Template
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Audience
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Sent
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Results
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {((campaigns ?? []) as CampaignRow[]).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No campaigns sent yet.
                </td>
              </tr>
            ) : (
              ((campaigns ?? []) as CampaignRow[]).map((c) => {
                const sent = c.sends.filter((s) => s.status === "sent").length;
                const failed = c.sends.filter((s) => s.status === "failed").length;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {c.template?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-700">
                      {c.audience}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {c.sent_at ? new Date(c.sent_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {sent} sent
                      {failed > 0 ? `, ${failed} failed` : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
