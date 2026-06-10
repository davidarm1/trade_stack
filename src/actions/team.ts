"use server";

import { createHash, randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant";
import { logAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { ALL_TEAM_ROLES, INVITABLE_ROLES } from "@/lib/team-roles";
import { buildAuthConfirmUrl } from "@/lib/auth-links";
import { sendInviteEmail } from "@/lib/email";
import { generateAndSendPasswordResetEmail } from "@/lib/password-reset";
import {
  getTeamMemberActionPermission,
} from "@/lib/team-member-permissions";
import type { MobileAccessToken, UserRole, UserRow } from "@/types/database";

export type TeamMemberUpdate = {
  name?: string | null;
  role?: UserRole;
  is_active?: boolean;
};

type TeamActionResult = {
  success: true;
  error: null;
} | {
  success: false;
  error: string;
};

type TeamActor = {
  userId: string;
  tenantId: string;
  role: UserRole;
};

export async function getTeamMembers() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

async function requireTeamManagerAccess(): Promise<{
  ok: true;
  supabase: Awaited<ReturnType<typeof createClient>>;
  actor: TeamActor;
} | {
  ok: false;
  error: string;
}> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { ok: false, error: ctx.error };
  const supabase = await createClient();
  const { data: me, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (error || !me?.role) {
    return { ok: false, error: error?.message ?? "Could not load your profile." };
  }
  if (me.role !== "owner" && me.role !== "office") {
    return { ok: false, error: "Only owners and office staff can manage team access." };
  }
  return {
    ok: true,
    supabase,
    actor: {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      role: me.role as UserRole,
    },
  };
}

async function getTargetUserForTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string,
): Promise<{ id: string; role: UserRole } | null> {
  const { data } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data?.id || !data?.role) return null;
  return { id: data.id, role: data.role as UserRole };
}

function isAlreadyRegisteredAuthError(error?: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  const code = error?.code ?? "";
  return /already.*register|already.*exist|email_exists|duplicate/i.test(
    `${code} ${message}`,
  );
}

async function getTenantName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
): Promise<string> {
  const { data } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  return String(data?.name ?? "your team");
}

async function getTeamMemberForTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string,
): Promise<{ id: string; email: string | null; role: UserRole; is_active: boolean } | null> {
  const { data } = await supabase
    .from("users")
    .select("id, email, role, is_active")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data?.id || !data.role) return null;
  return {
    id: data.id,
    email: data.email ?? null,
    role: data.role as UserRole,
    is_active: Boolean(data.is_active),
  };
}

async function syncTeamMemberAuthState(userId: string, active: boolean) {
  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return {
      error:
        "Missing SUPABASE_SERVICE_ROLE_KEY on the server. Add it to enable team member auth updates.",
    };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "87600h",
  });
  return { error: error?.message ?? null };
}

export async function inviteTeamMember(
  email: string,
  name: string,
  role: UserRole,
) {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return { data: null, error: access.error };
  const { actor } = access;

  if (!INVITABLE_ROLES.includes(role)) {
    return {
      data: null,
      error: "Choose a valid role: owner, office, engineer, or viewer.",
    };
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  if (!trimmedEmail) {
    return { data: null, error: "Email is required." };
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return {
      data: null,
      error:
        "Missing SUPABASE_SERVICE_ROLE_KEY on the server. Add it to enable team member creation.",
    };
  }

  const tenantId = actor.tenantId;
  const tenantName = await getTenantName(admin, tenantId);
  const baseUserRow = {
    tenant_id: tenantId,
    name: trimmedName || null,
    email: trimmedEmail,
    role,
    is_active: true,
  };

  const { data: invited, error: inviteErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email: trimmedEmail,
    options: {
      data: { tenant_id: tenantId, role },
    },
  });

  if (inviteErr || !invited?.user) {
    if (isAlreadyRegisteredAuthError(inviteErr)) {
      return {
        data: null,
        error:
          "That email already has a Supabase Auth account. Ask them to sign in, or remove the existing auth user before inviting them.",
      };
    }

    const msg = inviteErr?.message ?? "Invite failed";
    return { data: null, error: msg };
  }

  const userId = invited.user.id;
  const tokenHash = invited.properties?.hashed_token;
  if (!tokenHash) {
    await admin.auth.admin.deleteUser(userId);
    return { data: null, error: "Could not build invite link." };
  }

  const inviteUrl = buildAuthConfirmUrl({
    tokenHash,
    type: "invite",
    next: "/dashboard",
  });

  const { data: existing } = await admin
    .from("users")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (existing && existing.tenant_id !== tenantId) {
    await admin.auth.admin.deleteUser(userId);
    return {
      data: null,
      error: "That auth user already belongs to a different tenant.",
    };
  }

  const { error: upsertErr } = await admin.from("users").upsert(
    {
      id: userId,
      ...baseUserRow,
    },
    { onConflict: "id" },
  );

  if (upsertErr) {
    await admin.auth.admin.deleteUser(userId);
    return { data: null, error: upsertErr.message };
  }

  await sendInviteEmail({
    to: trimmedEmail,
    tenantName,
    role,
    inviteUrl,
  });

  revalidatePath("/team");
  return { data: { userId }, error: null };
}

export async function updateTeamMember(id: string, data: TeamMemberUpdate) {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return { data: null, error: access.error };
  const { supabase, actor } = access;

  const { data: target, error: tErr } = await supabase
    .from("users")
    .select("id, role, is_active")
    .eq("id", id)
    .eq("tenant_id", actor.tenantId)
    .maybeSingle();

  if (tErr || !target) {
    return { data: null, error: tErr?.message ?? "User not found." };
  }

  if (
    data.name === undefined &&
    data.role === undefined &&
    data.is_active === undefined
  ) {
    return { data: null, error: "Nothing to update." };
  }

  if (data.is_active === false && id === actor.userId) {
    return { data: null, error: "You cannot deactivate your own account." };
  }

  if (data.role !== undefined && data.role !== target.role) {
    if (!ALL_TEAM_ROLES.includes(data.role)) {
      return { data: null, error: "Choose a valid role." };
    }
    if (id === actor.userId) {
      return { data: null, error: "You cannot change your own role." };
    }
    if (actor.role !== "owner") {
      return { data: null, error: "Only owners can change roles." };
    }
    if (target.role === "owner" && data.role !== "owner") {
      const { count, error: cErr } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", actor.tenantId)
        .eq("role", "owner");
      if (cErr) return { data: null, error: cErr.message };
      if ((count ?? 0) <= 1) {
        return { data: null, error: "Cannot remove the last owner from the tenant." };
      }
    }
  }

  const activeChanged =
    data.is_active !== undefined && data.is_active !== target.is_active;
  if (activeChanged) {
    const permission = getTeamMemberActionPermission({
      action: data.is_active ? "reactivate" : "deactivate",
      actorRole: actor.role,
      actorUserId: actor.userId,
      targetRole: target.role,
      targetUserId: target.id,
    });
    if (!permission.allowed) {
      return { data: null, error: permission.reason };
    }
    const nextActive = (data.is_active ?? target.is_active) as boolean;
    const authResult = await syncTeamMemberAuthState(target.id, nextActive);
    if (authResult.error) {
      return { data: null, error: authResult.error };
    }
  }

  const patch: Partial<UserRow> = {
    updated_at: new Date().toISOString(),
  };
  if (data.name !== undefined) {
    patch.name = data.name?.trim() ? data.name.trim() : null;
  }
  if (data.role !== undefined) {
    patch.role = data.role;
  }
  if (data.is_active !== undefined) {
    patch.is_active = data.is_active;
  }

  const { data: row, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", actor.tenantId)
    .select()
    .single();

  if (error) {
    if (activeChanged) {
      const rollback = await syncTeamMemberAuthState(target.id, target.is_active);
      if (rollback.error) {
        console.error("Failed to rollback team member auth state after DB update failure.", {
          userId: id,
          error: rollback.error,
        });
      }
    }
    return { data: null, error: error.message };
  }
  revalidatePath("/team");
  revalidatePath("/", "layout");
  return { data: row, error: null };
}

export async function sendTeamMemberResetEmail(userId: string): Promise<TeamActionResult> {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return { success: false, error: access.error };
  const { supabase, actor } = access;

  const target = await getTeamMemberForTenant(supabase, actor.tenantId, userId);
  if (!target) {
    return { success: false, error: "You are not allowed to manage that user." };
  }

  const permission = getTeamMemberActionPermission({
    action: "send-reset",
    actorRole: actor.role,
    actorUserId: actor.userId,
    targetRole: target.role,
    targetUserId: target.id,
  });
  if (!permission.allowed) {
    return { success: false, error: permission.reason };
  }
  if (!target.email) {
    return { success: false, error: "That user does not have an email address." };
  }

  const result = await generateAndSendPasswordResetEmail(target.email);
  if (result.error) return { success: false, error: result.error };
  return { success: true, error: null };
}

async function updateTeamMemberAuthAndProfile(args: {
  userId: string;
  nextActive: boolean;
  actor: TeamActor;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<TeamActionResult> {
  const { userId, nextActive, actor, supabase } = args;
  const target = await getTeamMemberForTenant(supabase, actor.tenantId, userId);
  if (!target) {
    return { success: false, error: "User not found." };
  }

  const permission = getTeamMemberActionPermission({
    action: nextActive ? "reactivate" : "deactivate",
    actorRole: actor.role,
    actorUserId: actor.userId,
    targetRole: target.role,
    targetUserId: target.id,
  });
  if (!permission.allowed) {
    return { success: false, error: permission.reason };
  }

  const authResult = await syncTeamMemberAuthState(userId, nextActive);
  if (authResult.error) {
    return { success: false, error: authResult.error };
  }

  const { error } = await supabase
    .from("users")
    .update({
      is_active: nextActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("tenant_id", actor.tenantId);

  if (error) {
    const rollback = await syncTeamMemberAuthState(userId, !nextActive);
    if (rollback.error) {
      console.error("Failed to rollback auth state after team member status update failed.", {
        userId,
        error: rollback.error,
      });
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/team");
  revalidatePath("/", "layout");
  return { success: true, error: null };
}

export async function deactivateTeamMember(userId: string): Promise<TeamActionResult> {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return { success: false, error: access.error };
  return updateTeamMemberAuthAndProfile({
    userId,
    nextActive: false,
    actor: access.actor,
    supabase: access.supabase,
  });
}

export async function reactivateTeamMember(userId: string): Promise<TeamActionResult> {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return { success: false, error: access.error };
  return updateTeamMemberAuthAndProfile({
    userId,
    nextActive: true,
    actor: access.actor,
    supabase: access.supabase,
  });
}

function tenantTokenPrefix(tenantId: string): string {
  const compact = tenantId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return (compact.slice(0, 4) || "TENX").padEnd(4, "X");
}

function generateReadableToken(tenantId: string): string {
  const raw = randomBytes(10).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.slice(0, 12).padEnd(12, "X");
  const prefix = tenantTokenPrefix(tenantId);
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

function hashTokenForTenant(token: string, tenantId: string): string {
  // Namespaces token hashes by tenant so the same plaintext in another tenant is unrelated.
  return createHash("sha256").update(`${tenantId}:${token}`).digest("hex");
}

export async function listMobileAccessTokens(userId: string) {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return { data: null, error: access.error };
  const { supabase, actor } = access;

  const target = await getTargetUserForTenant(supabase, actor.tenantId, userId);
  if (!target) return { data: null, error: "User not found." };

  const { data, error } = await supabase
    .from("mobile_access_tokens")
    .select("*")
    .eq("tenant_id", actor.tenantId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return { data: null, error: error.message };

  return { data: (data ?? []) as MobileAccessToken[], error: null };
}

export async function generateMobileAccessToken(userId: string) {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return { data: null, error: access.error };
  const { supabase, actor } = access;

  const target = await getTargetUserForTenant(supabase, actor.tenantId, userId);
  if (!target) return { data: null, error: "User not found." };

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("mobile_access_tokens")
    .update({ revoked_at: nowIso })
    .eq("tenant_id", actor.tenantId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .is("used_at", null);

  // Ultra-low collision already, but retry if unique hash index ever conflicts.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateReadableToken(actor.tenantId);
    const hint = token.slice(-4);
    const tokenHash = hashTokenForTenant(token, actor.tenantId);

    const { data, error } = await supabase
      .from("mobile_access_tokens")
      .insert({
        tenant_id: actor.tenantId,
        user_id: userId,
        token_hash: tokenHash,
        token_hint: hint,
        created_by_id: actor.userId,
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (!error && data) {
      await logAuditEvent({
        event: "mobile_token_generated",
        tenant_id: actor.tenantId,
        user_id: actor.userId,
        metadata: {
          target_user_id: userId,
          token_id: data.id,
          token_hint: hint,
          expires_at: expiresAt,
        },
      });
      revalidatePath("/team");
      return { data: { token, row: data as MobileAccessToken }, error: null };
    }
    const isUniqueViolation =
      (error as { code?: string } | null)?.code === "23505" ||
      /unique|duplicate/i.test(error?.message ?? "");
    if (!isUniqueViolation) return { data: null, error: error?.message ?? "Could not generate token." };
  }

  return { data: null, error: "Could not generate a unique token. Please try again." };
}

export async function revokeMobileAccessToken(tokenId: string, userId: string) {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return { data: null, error: access.error };
  const { supabase, actor } = access;

  const target = await getTargetUserForTenant(supabase, actor.tenantId, userId);
  if (!target) return { data: null, error: "User not found." };

  const { data, error } = await supabase
    .from("mobile_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("tenant_id", actor.tenantId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("*")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Token already revoked or not found." };

  await logAuditEvent({
    event: "mobile_token_revoked",
    tenant_id: actor.tenantId,
    user_id: actor.userId,
    metadata: {
      target_user_id: userId,
      token_id: tokenId,
    },
  });
  revalidatePath("/team");
  return { data: data as MobileAccessToken, error: null };
}
