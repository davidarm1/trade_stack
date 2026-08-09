"use server";

import { createClient } from "@/lib/supabase/server";
import { getTenantContext, getCurrentUserRole } from "@/lib/tenant";
import { sendMarketingEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import type {
  EmailCampaign,
  EmailMarketingAudience,
  EmailSend,
  EmailTemplate,
} from "@/types/database";

async function requireMarketingManagerContext() {
  const ctx = await getTenantContext();
  if (!ctx.success) return ctx;
  const role = await getCurrentUserRole();
  if (role !== "owner" && role !== "office") {
    return {
      success: false as const,
      error: "Only owners and office staff can send marketing email.",
    };
  }
  return ctx;
}

export async function getEmailTemplates() {
  const ctx = await requireMarketingManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trade_stack_email_templates")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as EmailTemplate[], error: null };
}

export async function getEmailTemplate(id: string) {
  const ctx = await requireMarketingManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trade_stack_email_templates")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as EmailTemplate | null, error: null };
}

export async function createEmailTemplate(args: {
  name: string;
  subject: string;
  bodyHtml: string;
}) {
  const ctx = await requireMarketingManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("trade_stack_email_templates")
    .insert({
      tenant_id: ctx.tenantId,
      name: args.name,
      subject: args.subject,
      body_html: args.bodyHtml,
      created_by_id: ctx.userId,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/email-marketing");
  return { data: row as EmailTemplate, error: null };
}

export async function getCampaigns() {
  const ctx = await requireMarketingManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trade_stack_email_campaigns")
    .select("*, template:trade_stack_email_templates(name), sends:trade_stack_email_sends(status)")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

async function getOptedInClientRecipients(tenantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("contact_email, contact_name, company_name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("marketing_opt_in", true)
    .not("contact_email", "is", null);
  if (error) return { data: null, error: error.message };
  return {
    data: (data ?? []).map((c) => ({
      email: c.contact_email as string,
      name: c.contact_name ?? c.company_name ?? null,
    })),
    error: null,
  };
}

async function getStaffRecipients(tenantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("email, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("email", "is", null);
  if (error) return { data: null, error: error.message };
  return {
    data: (data ?? []).map((u) => ({ email: u.email as string, name: u.name ?? null })),
    error: null,
  };
}

/**
 * Send a campaign: resolves recipients for the chosen audience, then sends
 * one individually-addressed email per recipient (never a bulk/CC send),
 * recording a status row for each in `trade_stack_email_sends` (named to
 * avoid a collision with a pre-existing, unrelated email_sends table on
 * this project — see the 20260812090000 migration).
 *
 * Client audience is restricted to `marketing_opt_in = true` rows —
 * enforced here, not just in the UI. There is no unsubscribe-link /
 * suppression-list automation yet; see Trade Stack - Email Marketing.md
 * before pointing this at real customers.
 */
export async function sendCampaign(args: {
  templateId: string;
  audience: EmailMarketingAudience;
}) {
  const ctx = await requireMarketingManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: template, error: templateErr } = await supabase
    .from("trade_stack_email_templates")
    .select("*")
    .eq("id", args.templateId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (templateErr) return { data: null, error: templateErr.message };
  if (!template) return { data: null, error: "Template not found." };

  const recipientsResult =
    args.audience === "clients"
      ? await getOptedInClientRecipients(ctx.tenantId)
      : await getStaffRecipients(ctx.tenantId);
  if (recipientsResult.error) return { data: null, error: recipientsResult.error };
  const recipients = recipientsResult.data ?? [];

  if (recipients.length === 0) {
    return {
      data: null,
      error:
        args.audience === "clients"
          ? "No opted-in clients with an email address."
          : "No active staff with an email address.",
    };
  }

  const { data: campaign, error: campaignErr } = await supabase
    .from("trade_stack_email_campaigns")
    .insert({
      tenant_id: ctx.tenantId,
      template_id: args.templateId,
      audience: args.audience,
      sent_by_id: ctx.userId,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (campaignErr) return { data: null, error: campaignErr.message };

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const result = await sendMarketingEmail({
      to: recipient.email,
      subject: template.subject,
      html: template.body_html,
      text: template.body_html.replace(/<[^>]+>/g, " ").trim(),
    });

    await supabase.from("trade_stack_email_sends").insert({
      tenant_id: ctx.tenantId,
      campaign_id: campaign.id,
      recipient_email: recipient.email,
      recipient_name: recipient.name,
      status: result.success ? "sent" : "failed",
      error: result.success ? null : (result.error ?? "Unknown error"),
      sent_at: result.success ? new Date().toISOString() : null,
    });

    if (result.success) sentCount += 1;
    else failedCount += 1;
  }

  revalidatePath("/email-marketing");
  return {
    data: { campaign: campaign as EmailCampaign, sentCount, failedCount },
    error: null,
  };
}

export async function getCampaignSends(campaignId: string) {
  const ctx = await requireMarketingManagerContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trade_stack_email_sends")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data as EmailSend[], error: null };
}
