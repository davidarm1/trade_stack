import { redirect } from "next/navigation";
import { resolveBrandingFromSettings } from "@/lib/branding-settings";
import { createClient } from "@/lib/supabase/server";
import { formatJobRefFormal } from "@/lib/job-number";
import { JobSheetView } from "./job-sheet-view";

function opt(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

export default async function JobSheetStandalonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { id } = await params;
  const { embed } = await searchParams;
  const isEmbed = embed === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job) redirect("/jobs");

  const [
    { data: tenant },
    settingsRows,
    { data: client },
    { data: materials },
    { data: engineer },
    { data: completion },
  ] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", job.tenant_id).maybeSingle(),
    supabase.from("settings").select("field_key, field_value").eq("tenant_id", job.tenant_id),
    job.client_id
      ? supabase.from("clients").select("*").eq("id", job.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("job_materials")
      .select("*")
      .eq("job_id", id)
      .eq("tenant_id", job.tenant_id)
      .order("sort_order", { ascending: true }),
    job.assigned_engineer_id
      ? supabase.from("users").select("name").eq("id", job.assigned_engineer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("job_completions")
      .select("*")
      .eq("job_id", id)
      .eq("tenant_id", job.tenant_id)
      .maybeSingle(),
  ]);

  const settings = Object.fromEntries(
    (settingsRows.data ?? []).map((r) => [String(r.field_key), String(r.field_value ?? "")]),
  );

  const { showLogo, showName } = resolveBrandingFromSettings(settings);
  const companyLogoUrl = String(tenant?.logo_url ?? "").trim() || null;
  const companyName = opt(settings.company_name) ?? opt(tenant?.name);

  const companyDetailLines = [
    settings.address_line_1 || tenant?.address1,
    settings.address_line_2 || tenant?.address2,
    settings.town || tenant?.town,
    settings.postcode || tenant?.postcode,
    opt(settings.phone ?? tenant?.phone) ? `Tel: ${settings.phone || tenant?.phone}` : null,
    opt(settings.email ?? tenant?.email) ? `Email: ${settings.email || tenant?.email}` : null,
  ]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);

  const siteLines = [
    job.site_address1 ?? client?.site_address1 ?? client?.address1,
    job.site_address2 ?? client?.site_address2 ?? client?.address2,
    job.site_town ?? client?.site_town ?? client?.town,
    job.site_postcode ?? client?.site_postcode ?? client?.postcode,
  ]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);

  const jobRef =
    formatJobRefFormal(job.job_number as number | null | undefined) ||
    `JOB-${String(job.id).slice(0, 8)}`;

  const signatureUrl =
    opt(job.signature_url) ??
    opt((completion as { client_signature_url?: string | null } | null)?.client_signature_url);

  const dateOnSite = job.date_onsite
    ? new Date(String(job.date_onsite)).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <JobSheetView
      embed={isEmbed}
      jobRef={jobRef}
      companyName={companyName}
      companyDetailLines={companyDetailLines}
      companyLogoUrl={companyLogoUrl}
      brandingShowLogo={Boolean(showLogo && companyLogoUrl)}
      brandingShowCompanyName={showName}
      clientName={
        opt(client?.company_name ?? client?.contact_name) ?? "—"
      }
      siteLines={siteLines}
      contactName={
        client?.contact_name && client.contact_name !== (client?.company_name ?? "")
          ? String(client.contact_name)
          : null
      }
      contactNumber={opt(client?.contact_number)}
      dateOnSite={dateOnSite}
      timeOnSite={opt(job.time_onsite)}
      engineerName={opt(engineer?.name)}
      status={opt(job.status)}
      poNumber={opt(job.client_order_number ?? job.custom_po_number)}
      jobDescription={opt(job.description)}
      workCarriedOut={opt(completion?.work_carried_out)}
      partsUsed={opt((completion as { parts_used?: string | null } | null)?.parts_used)}
      recommendations={opt(
        (completion as { recommendations?: string | null } | null)?.recommendations,
      )}
      materials={(materials ?? []).map((m) => ({
        description: String(m.description ?? "").trim(),
        quantity: m.quantity != null ? Number(m.quantity) : null,
        unitPrice: m.unit_price != null ? Number(m.unit_price) : null,
        totalPrice: m.total_price != null ? Number(m.total_price) : null,
      }))}
      labourCharge={job.labour_charge != null ? Number(job.labour_charge) : null}
      totalMaterials={job.total_materials != null ? Number(job.total_materials) : null}
      printName={opt(
        (completion as { client_print_name?: string | null } | null)?.client_print_name,
      )}
      signatureUrl={signatureUrl}
      signedAt={
        opt(job.signed_at) ??
        opt((completion as { submitted_at?: string | null } | null)?.submitted_at)
      }
      startTime={opt((completion as { start_time?: string | null } | null)?.start_time)}
      finishTime={opt((completion as { finish_time?: string | null } | null)?.finish_time)}
    />
  );
}
