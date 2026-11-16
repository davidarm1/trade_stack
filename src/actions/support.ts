"use server";

import { revalidatePath } from "next/cache";
import { logAuditEvent } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { closeSupportSessions, openSupportSession } from "@/lib/support-session";

/** Open a support session in a company. Platform admins only (MFA enforced). */
export async function startSupportSession(input: {
  tenantId: string;
  mode: string;
  minutes: number;
  reason: string;
}): Promise<{ error: string | null }> {
  const { userId } = await requirePlatformAdmin();
  const result = await openSupportSession({
    adminUserId: userId,
    tenantId: input.tenantId,
    mode: input.mode,
    minutes: input.minutes,
    reason: input.reason,
  });
  if (!result.error) revalidatePath("/", "layout");
  return result;
}

export async function endSupportSession(): Promise<{ error: string | null }> {
  const { userId } = await requirePlatformAdmin();
  const result = await closeSupportSessions(userId);
  if (!result.error) revalidatePath("/", "layout");
  return result;
}

/** Give a team member platform-admin (support) access, by the email of an existing account. */
export async function grantPlatformAdmin(email: string): Promise<{ error: string | null }> {
  const { userId } = await requirePlatformAdmin();
  const clean = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { error: "Enter a valid email address." };

  const admin = createServiceRoleClient();
  const { data: target } = await admin
    .from("users")
    .select("id, account_type")
    .ilike("email", clean)
    .maybeSingle();
  if (!target) {
    return { error: "No account with that email. They need to sign up first, then add them here." };
  }

  const { error } = await admin
    .from("platform_admins")
    .upsert({ user_id: target.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) return { error: error.message };
  await admin.from("users").update({ account_type: "platform_staff" }).eq("id", target.id);

  await logAuditEvent({
    event: "platform_admin_granted",
    user_id: userId,
    metadata: { target_user_id: target.id, email: clean },
  });
  revalidatePath("/admin/staff");
  return { error: null };
}

export async function revokePlatformAdmin(targetUserId: string): Promise<{ error: string | null }> {
  const { userId } = await requirePlatformAdmin();
  if (targetUserId === userId) return { error: "You can't remove your own access." };

  const admin = createServiceRoleClient();
  const { count } = await admin
    .from("platform_admins")
    .select("user_id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) return { error: "At least one platform admin must remain." };

  const { error } = await admin.from("platform_admins").delete().eq("user_id", targetUserId);
  if (error) return { error: error.message };

  // Cut off any support session they have open, and revert the account type.
  await closeSupportSessions(targetUserId, "access_revoked");
  await admin
    .from("users")
    .update({ account_type: "employee" })
    .eq("id", targetUserId)
    .eq("account_type", "platform_staff");

  await logAuditEvent({
    event: "platform_admin_revoked",
    user_id: userId,
    metadata: { target_user_id: targetUserId },
  });
  revalidatePath("/admin/staff");
  return { error: null };
}
