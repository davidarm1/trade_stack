import "server-only";

import { headers } from "next/headers";
import { logAuditEvent } from "@/lib/audit";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  clampSupportMinutes,
  parseSupportMode,
  roleForSupportMode,
  validateSupportReason,
  type SupportMode,
} from "@/lib/support-session-rules";

export type SupportSessionInfo = {
  membershipId: string;
  companyId: string;
  companyName: string;
  role: string;
  expiresAt: string;
};

async function requestMeta() {
  try {
    const h = await headers();
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: h.get("user-agent"),
    };
  } catch {
    return { ip: null, user_agent: null };
  }
}

/**
 * Opens a time-limited support membership for a platform admin in `tenantId`.
 * The caller MUST already have passed requirePlatformAdmin().
 */
export async function openSupportSession(args: {
  adminUserId: string;
  tenantId: string;
  mode: unknown;
  minutes: unknown;
  reason: unknown;
}): Promise<{ error: string | null }> {
  const mode: SupportMode = parseSupportMode(args.mode);
  const minutes = clampSupportMinutes(args.minutes);
  const { reason, error: reasonError } = validateSupportReason(args.reason);
  if (reasonError) return { error: reasonError };

  const admin = createServiceRoleClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name")
    .eq("id", args.tenantId)
    .maybeSingle();
  if (!tenant) return { error: "Company not found." };

  const { data: existing } = await admin
    .from("memberships")
    .select("id, is_support")
    .eq("user_id", args.adminUserId)
    .eq("company_id", args.tenantId)
    .maybeSingle();
  if (existing && !existing.is_support) {
    return { error: "This account already belongs to that company as a normal member." };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + minutes * 60_000).toISOString();
  const role = roleForSupportMode(mode);

  // Only one support session at a time: close any in other companies.
  const { error: closeErr } = await admin
    .from("memberships")
    .update({ status: "leaver", updated_at: nowIso })
    .eq("user_id", args.adminUserId)
    .eq("is_support", true)
    .eq("status", "active")
    .neq("company_id", args.tenantId);
  if (closeErr) return { error: closeErr.message };

  const fields = {
    role,
    status: "active",
    is_support: true,
    concurrent_allowed: true,
    expires_at: expiresAt,
    support_reason: reason,
    display_name: "Trade Stack Support",
    // Latest-updated active membership wins, so this makes it the current one.
    updated_at: nowIso,
  };

  let membershipId: string | null = existing?.id ?? null;
  if (existing) {
    const { error } = await admin.from("memberships").update(fields).eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await admin
      .from("memberships")
      .insert({ user_id: args.adminUserId, company_id: args.tenantId, ...fields })
      .select("id")
      .single();
    if (error) return { error: error.message };
    membershipId = data.id as string;
  }

  await logAuditEvent({
    event: "support_session_started",
    tenant_id: args.tenantId,
    membership_id: membershipId,
    user_id: args.adminUserId,
    ...(await requestMeta()),
    metadata: { mode, role, minutes, reason, company: tenant.name, expires_at: expiresAt },
  });
  return { error: null };
}

/** Ends every active support session for the given admin user. */
export async function closeSupportSessions(adminUserId: string, why = "ended_by_admin") {
  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { data: open } = await admin
    .from("memberships")
    .select("id, company_id")
    .eq("user_id", adminUserId)
    .eq("is_support", true)
    .eq("status", "active");

  const { error } = await admin
    .from("memberships")
    .update({ status: "leaver", updated_at: nowIso })
    .eq("user_id", adminUserId)
    .eq("is_support", true)
    .eq("status", "active");
  if (error) return { error: error.message };

  const meta = await requestMeta();
  for (const m of open ?? []) {
    await logAuditEvent({
      event: "support_session_ended",
      tenant_id: m.company_id as string,
      membership_id: m.id as string,
      user_id: adminUserId,
      ...meta,
      metadata: { why },
    });
  }
  return { error: null };
}

/** The signed-in user's live support session, if they are in one (for the banner). */
export async function getSupportSessionInfo(): Promise<SupportSessionInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createServiceRoleClient();
  const { data: m } = await admin
    .from("memberships")
    .select("id, company_id, role, expires_at")
    .eq("user_id", user.id)
    .eq("is_support", true)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!m) return null;

  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", m.company_id)
    .maybeSingle();
  return {
    membershipId: m.id as string,
    companyId: m.company_id as string,
    companyName: String(tenant?.name ?? "this company"),
    role: String(m.role),
    expiresAt: String(m.expires_at),
  };
}
