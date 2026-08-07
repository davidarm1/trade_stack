import { notFound } from "next/navigation";
import { getEmailTemplate, getCampaigns } from "@/actions/email-marketing";
import { SendCampaignForm } from "./send-campaign-form";

type CampaignRow = {
  id: string;
  template_id: string;
  audience: string;
  sent_at: string | null;
  sends: { status: string }[];
};

export default async function EmailTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data: template, error }, { data: campaigns }] = await Promise.all([
    getEmailTemplate(id),
    getCampaigns(),
  ]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }
  if (!template) return notFound();

  const templateCampaigns = ((campaigns ?? []) as CampaignRow[]).filter(
    (c) => c.template_id === template.id,
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">{template.name}</h1>
      <p className="mt-1 text-sm text-slate-600">Subject: {template.subject}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Preview</h2>
            <div
              className="prose prose-sm mt-2 max-w-none rounded-md border border-slate-100 p-3"
              dangerouslySetInnerHTML={{ __html: template.body_html }}
            />
          </div>

          <div className="mt-6">
            <SendCampaignForm templateId={template.id} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Send history
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {templateCampaigns.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                Not sent yet.
              </p>
            ) : (
              templateCampaigns.map((c) => {
                const sent = c.sends.filter((s) => s.status === "sent").length;
                const failed = c.sends.filter((s) => s.status === "failed").length;
                return (
                  <div key={c.id} className="px-4 py-3 text-sm">
                    <p className="font-medium capitalize text-slate-900">
                      {c.audience}
                    </p>
                    <p className="text-xs text-slate-500">
                      {c.sent_at ? new Date(c.sent_at).toLocaleString() : "—"}{" "}
                      — {sent} sent{failed > 0 ? `, ${failed} failed` : ""}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
