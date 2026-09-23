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
import type { MobileAccessToken, UserRole } from "@/types/database";

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
  membershipId: string;
  tenantId: string;
  role: UserRole;
};

export type EngineerOption = { id: string; name: string | null };

// Membership-driven, not users.tenant_id-driven: a person can have an
// active membership at this company regardless of which company their
// users row calls "home" (a freelancer working for several companies).
// Iterating memberships first, rather than filtering users by tenant_id
// and then matching a membership, is what makes that visible here.
export async function getAssignableEngineers() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("id, user_id, display_name")
    .eq("company_id", ctx.tenantId)
    .eq("status", "active")
    .order("display_name", { ascending: true });
  if (membershipsError) return { data: null, error: membershipsError.message };

  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const { data: users, error: usersError } =
    userIds.length > 0
      ? await supabase.from("users").select("id, name, email").in("id", userIds)
      : { data: [] as { id: string; name: string | null; email: string | null }[], error: null };
  if (usersError) return { data: null, error: usersError.message };
  const userById = new Map((users ?? []).map((u) => [u.id, u] as const));

  const engineers: EngineerOption[] = (memberships ?? []).map((m) => {
    const u = userById.get(m.user_id);
    return {
      id: m.id,
      name: m.display_name ?? u?.name ?? u?.email ?? m.id,
    };
  });

  return { data: engineers, error: null };
}

// For filter dropdowns on pages (wages, timesheets) whose rows are keyed by
// membership_id, not user id — includes inactive/leaver members too, unlike
// getAssignableEngineers, so historical records for former staff stay
// filterable. Members with no membership row yet are simply omitted rather
// than self-healed, since this is a read-only listing.
export async function getTeamMembersWithMembershipIds(): Promise<{
  data: EngineerOption[] | null;
  error: string | null;
}> {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const [{ data: users, error: usersError }, { data: memberships, error: membershipsError }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, name, email")
        .eq("tenant_id", ctx.tenantId),
      supabase
        .from("memberships")
        .select("id, user_id, display_name")
        .eq("company_id", ctx.tenantId),
    ]);

  if (usersError) return { data: null, error: usersError.message };
  if (membershipsError) return { data: null, error: membershipsError.message };

  const membershipByUserId = new Map(
    (memberships ?? []).map((m) => [m.user_id, m] as const),
  );

  const options = (users ?? [])
    .map((u) => {
      const membership = membershipByUserId.get(u.id);
      if (!membership) return null;
      return {
        id: membership.id,
        name: membership.display_name ?? u.name ?? u.email ?? membership.id,
      };
    })
    .filter((v): v is EngineerOption => v !== null);

  return { data: options, error: null };
}

// Same membership-driven shift as getAssignableEngineers, but keeps the
// returned row shape identical to the old users-row shape (id/name/email/
// role/is_active, all other users columns too) — role and is_active are
// just overlaid from this company's membership instead of the global user
// row, so the Team page UI doesn't need to change at all. A person only
// shows up here if they have a membership at THIS company, regardless of
// which company their users row calls home.
export async function getTeamMembers() {
  const ctx = await getTenantContext();
  if (!ctx.success) return { data: null, error: ctx.error };
  const supabase = await createClient();

  const { data: memberships, error: mErr } = await supabase
    .from("memberships")
    .select("user_id, role, status, display_name")
    .eq("company_id", ctx.tenantId);
  if (mErr) return { data: null, error: mErr.message };

  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  if (userIds.length === 0) return { data: [], error: null };

  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("*")
    .in("id", userIds);
  if (uErr) return { data: null, error: uErr.message };

  const membershipByUserId = new Map(
    (memberships ?? []).map((m) => [m.user_id, m] as const),
  );

  const rows = (users ?? [])
    .map((u) => {
      const m = membershipByUserId.get(u.id);
      if (!m) return null;
      return {
        ...u,
        role: m.role as UserRole,
        is_active: m.status === "active",
        name: m.display_name ?? u.name,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  return { data: rows, error: null };
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

  // Role is scoped to THIS company via the actor's own membership — never
  // their global users.role. A person can be owner at their own company and
  // just an engineer (or nothing) at another; trusting the global role here
  // would let an owner-elsewhere silently manage a team they're not actually
  // in charge of.
  let membership: { id: string; role: string; status: string } | null = null;
  if (ctx.membershipId) {
    const { data, error } = await supabase
      .from("memberships")
      .select("id, role, status")
      .eq("id", ctx.membershipId)
      .eq("company_id", ctx.tenantId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    membership = data;
  }

  if (!membership) {
    // Genuinely no membership row yet for this company — self-heal from
    // their profile, same fallback as before. Only reached when nothing
    // exists yet; an existing-but-inactive membership is handled below
    // without touching it, so this can never silently reactivate someone.
    const { data: me, error } = await supabase
      .from("users")
      .select("role, name")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error || !me?.role) {
      return { ok: false, error: error?.message ?? "Could not load your profile." };
    }
    const ensured = await ensureMembershipForUser(ctx.tenantId, {
      id: ctx.userId,
      role: me.role as UserRole,
      name: (me as { name?: string | null }).name ?? null,
    });
    if (!ensured.membershipId) {
      return {
        ok: false,
        error: ensured.error ?? "Could not resolve your membership record.",
      };
    }
    membership = { id: ensured.membershipId, role: me.role, status: "active" };
  }

  if (membership.status !== "active") {
    return { ok: false, error: "Your access to this company is not currently active." };
  }
  const role = membership.role as UserRole;
  if (role !== "owner" && role !== "office") {
    return { ok: false, error: "Only owners and office staff can manage team access." };
  }

  return {
    ok: true,
    supabase,
    actor: {
      userId: ctx.userId,
      membershipId: membership.id,
      tenantId: ctx.tenantId,
      role,
    },
  };
}

async function requireTeamOwnerAccess(): Promise<{
  ok: true;
  supabase: Awaited<ReturnType<typeof createClient>>;
  actor: TeamActor;
} | {
  ok: false;
  error: string;
}> {
  const access = await requireTeamManagerAccess();
  if (!access.ok) return access;
  if (access.actor.role !== "owner") {
    return { ok: false, error: "Only owners can reset two-factor authentication." };
  }
  return access;
}

// Creates the membership row for a user if one doesn't already exist for this
// tenant. Team members invited via inviteTeamMember get one immediately, but
// this also self-heals older/edge-case users (invited before that fix, or
// otherwise missing one) so actions that require a membership id — e.g.
// mobile access tokens — don't fail with a spurious "User not found."
async function ensureMembershipForUser(
  tenantId: string,
  user: { id: string; role: UserRole; name?: string | null },
): Promise<{ membershipId: string | null; error: string | null }> {
  const admin = createServiceRoleClient();

  const { data: existing, error: existingError } = await admin
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", tenantId)
    .maybeSingle();
  if (existingError) return { membershipId: null, error: existingError.message };
  if (existing?.id) return { membershipId: existing.id, error: null };

  const now = new Date().toISOString();
  const { data: created, error: createError } = await admin
    .from("memberships")
    .upsert(
      {
        user_id: user.id,
        company_id: tenantId,
        role: String(user.role ?? "viewer"),
        status: "active",
        display_name: user.name ?? null,
        job_title: null,
        employee_ref: null,
        work_phone: null,
        concurrent_allowed: false,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,company_id" },
    )
    .select("id")
    .single();
  if (createError || !created) {
    return {
      membershipId: null,
      error: createError?.message ?? "Could not create membership record.",
    };
  }
  return { membershipId: created.id, error: null };
}

async function getTargetUserForTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string,
): Promise<{ id: string; membershipId: string; role: UserRole } | null> {
  // Membership-first, not users.tenant_id-first: a freelancer's membership
  // at this company is what matters here, not which company their users
  // row calls home (which could be somewhere else entirely).
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id, role")
    .eq("user_id", userId)
    .eq("company_id", tenantId)
    .maybeSingle();
  if (membershipError) return null;

  if (membership?.id) {
    return { id: userId, membershipId: membership.id, role: membership.role as UserRole };
  }

  // No membership yet at this company — self-heal from their profile (the
  // profile lookup itself is intentionally not scoped by tenant_id, since a
  // freelancer's home company can be a different one).
  const { data, error: userError } = await supabase
    .from("users")
    .select("id, role, name")
    .eq("id", userId)
    .maybeSingle();
  if (userError || !data?.id || !data?.role) return null;

  const ensured = await ensureMembershipForUser(tenantId, {
    id: data.id,
    role: data.role as UserRole,
    name: (data as { name?: string | null }).name ?? null,
  });
  if (!ensured.membershipId) return null;

  return { id: data.id, membershipId: ensured.membershipId, role: data.role as UserRole };
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
  // Membership-scoped, not users.tenant_id-scoped — see getTargetUserForTenant.
  const { data: membership } = await supabase
    .from("memberships")
    .select("role, status")
    .eq("user_id", userId)
    .eq("company_id", tenantId)
    .maybeSingle();
  if (!membership?.role) return null;

  const { data: user } = await supabase
    .from("users")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  if (!user?.id) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    role: membership.role as UserRole,
    is_active: membership.status === "active",
  };
}

async function syncTeamMemberMembershipState(
  userId: string,
  tenantId: string,
  isActive: boolean,
) {
  const admin = createServiceRoleClient();
  const now = new Date().toISOString();

  const { data: membership, error } = await admin
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("company_id", tenantId)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!membership?.id) {
    return { error: null };
  }

  if (isActive) {
    const { error: membershipError } = await admin
      .from("memberships")
      .update({ status: "active", updated_at: now })
      .eq("id", membership.id);
    if (membershipError) return { error: membershipError.message };

    const { data: openSpell } = await admin
      .from("membership_spells")
      .select("id")
      .eq("membership_id", membership.id)
      .is("left_at", null)
      .maybeSingle();

    if (!openSpell) {
      const { error: spellError } = await admin.from("membership_spells").insert({
        membership_id: membership.id,
        joined_at: now,
        left_at: null,
        created_at: now,
        updated_at: now,
      });
      if (spellError) return { error: spellError.message };
    }

    return { error: null };
  }

  const { error: membershipError } = await admin
    .from("memberships")
    .update({ status: "leaver", updated_at: now })
    .eq("id", membership.id);
  if (membershipError) return { error: membershipError.message };

  const { error: spellError } = await admin
    .from("membership_spells")
    .update({ left_at: now, updated_at: now })
    .eq("membership_id", membership.id)
    .is("left_at", null);
  if (spellError) return { error: spellError.message };

  return { error: null };
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

  // Does an auth account already exist for this email? This is the normal
  // case for a freelancer already active at another company — Supabase
  // Auth won't let us create a second account for the same email, so reuse
  // the existing identity and just add a membership at THIS company rather
  // than treating it as an error.
  const { data: existingUserRow, error: existingLookupErr } = await admin
    .from("users")
    .select("id")
    .eq("email", trimmedEmail)
    .maybeSingle();
  if (existingLookupErr) {
    return { data: null, error: existingLookupErr.message };
  }

  if (existingUserRow) {
    const { data: existingMembership } = await admin
      .from("memberships")
      .select("id, status")
      .eq("user_id", existingUserRow.id)
      .eq("company_id", tenantId)
      .maybeSingle();
    if (existingMembership) {
      return {
        data: null,
        error:
          existingMembership.status === "active"
            ? "That person is already on your team."
            : "That person already has a record here — reactivate them from the Inactive tab instead of inviting again.",
      };
    }

    const now = new Date().toISOString();
    const { data: membership, error: membershipErr } = await admin
      .from("memberships")
      .insert({
        user_id: existingUserRow.id,
        company_id: tenantId,
        role,
        status: "active",
        display_name: trimmedName || null,
        job_title: null,
        employee_ref: null,
        work_phone: null,
        // They're now active at more than one company by definition.
        concurrent_allowed: true,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (membershipErr || !membership) {
      return { data: null, error: membershipErr?.message ?? "Could not create membership record." };
    }

    const { error: spellErr } = await admin.from("membership_spells").insert({
      membership_id: membership.id,
      joined_at: now,
      left_at: null,
      created_at: now,
      updated_at: now,
    });
    if (spellErr) {
      await admin.from("memberships").delete().eq("id", membership.id);
      return { data: null, error: spellErr.message };
    }

    // They already have working login credentials for their existing
    // company — no invite email needed. Generate a mobile token for them
    // from the Team page once they're added.
    revalidatePath("/team");
    return { data: { userId: existingUserRow.id }, error: null };
  }

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
      // We already checked public.users above and found nothing, so this is
      // a genuinely orphaned auth.users account with no matching profile —
      // not the normal multi-company case — and needs fixing directly in
      // Supabase before they can be invited.
      return {
        data: null,
        error:
          "That email has an auth account with no matching profile. This needs fixing directly in Supabase before they can be invited.",
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

  const membershipResult = await ensureMembershipForUser(tenantId, {
    id: userId,
    role,
    name: trimmedName || null,
  });
  if (!membershipResult.membershipId) {
    await admin.from("users").delete().eq("id", userId).eq("tenant_id", tenantId);
    await admin.auth.admin.deleteUser(userId);
    return { data: null, error: membershipResult.error ?? "Could not create membership record." };
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

  const { data: targetUser, error: tuErr } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (tuErr || !targetUser) {
    return { data: null, error: tuErr?.message ?? "User not found." };
  }

  // Role and active status are scoped to THIS company's membership, not the
  // global users row — deactivating or changing someone's role here must
  // never affect their standing at a different company they also work for.
  const { data: targetMembership, error: tmErr } = await supabase
    .from("memberships")
    .select("id, role, status")
    .eq("user_id", id)
    .eq("company_id", actor.tenantId)
    .maybeSingle();
  if (tmErr || !targetMembership) {
    return { data: null, error: tmErr?.message ?? "That person is not part of your team." };
  }
  const targetRole = targetMembership.role as UserRole;
  const targetIsActive = targetMembership.status === "active";

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

  if (data.role !== undefined && data.role !== targetRole) {
    if (!ALL_TEAM_ROLES.includes(data.role)) {
      return { data: null, error: "Choose a valid role." };
    }
    if (id === actor.userId) {
      return { data: null, error: "You cannot change your own role." };
    }
    if (actor.role !== "owner") {
      return { data: null, error: "Only owners can change roles." };
    }
    if (targetRole === "owner" && data.role !== "owner") {
      const { count, error: cErr } = await supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("company_id", actor.tenantId)
        .eq("role", "owner")
        .eq("status", "active");
      if (cErr) return { data: null, error: cErr.message };
      if ((count ?? 0) <= 1) {
        return { data: null, error: "Cannot remove the last owner from this company." };
      }
    }
  }

  const activeChanged =
    data.is_active !== undefined && data.is_active !== targetIsActive;
  if (activeChanged) {
    const permission = getTeamMemberActionPermission({
      action: data.is_active ? "reactivate" : "deactivate",
      actorRole: actor.role,
      actorUserId: actor.userId,
      targetRole,
      targetUserId: id,
    });
    if (!permission.allowed) {
      return { data: null, error: permission.reason };
    }
    const nextActive = (data.is_active ?? targetIsActive) as boolean;
    const membershipResult = await syncTeamMemberMembershipState(
      id,
      actor.tenantId,
      nextActive,
    );
    if (membershipResult.error) {
      return { data: null, error: membershipResult.error };
    }
  }

  if (data.role !== undefined && data.role !== targetRole) {
    // memberships has no UPDATE policy for the plain client — writes go
    // through the admin client, same as every other membership mutation in
    // this file, gated by requireTeamManagerAccess having already checked
    // the actor is owner/office at this company.
    const admin = createServiceRoleClient();
    const { error: roleErr } = await admin
      .from("memberships")
      .update({ role: data.role, updated_at: new Date().toISOString() })
      .eq("id", targetMembership.id)
      .eq("company_id", actor.tenantId);
    if (roleErr) return { data: null, error: roleErr.message };
  }

  let updatedName = targetUser.name;
  if (data.name !== undefined) {
    updatedName = data.name?.trim() ? data.name.trim() : null;
    const { error: nameErr } = await supabase
      .from("users")
      .update({ name: updatedName, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (nameErr) return { data: null, error: nameErr.message };
  }

  revalidatePath("/team");
  revalidatePath("/", "layout");
  return {
    data: {
      id,
      name: updatedName,
      role: data.role ?? targetRole,
      is_active: data.is_active ?? targetIsActive,
    },
    error: null,
  };
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

export async function resetTeamMemberMfa(userId: string): Promise<TeamActionResult> {
  const access = await requireTeamOwnerAccess();
  if (!access.ok) return { success: false, error: access.error };
  const { supabase, actor } = access;

  const target = await getTeamMemberForTenant(supabase, actor.tenantId, userId);
  if (!target) {
    return { success: false, error: "You are not allowed to manage that user." };
  }

  const permission = getTeamMemberActionPermission({
    action: "reset-mfa",
    actorRole: actor.role,
    actorUserId: actor.userId,
    targetRole: target.role,
    targetUserId: target.id,
  });
  if (!permission.allowed) {
    return { success: false, error: permission.reason };
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return {
      success: false,
      error:
        "Missing SUPABASE_SERVICE_ROLE_KEY on the server. Add it to enable 2FA resets.",
    };
  }

  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) return { success: false, error: error.message };

  const factors = data?.factors ?? [];
  if (factors.length === 0) {
    return { success: false, error: "That user does not have any 2FA factors to reset." };
  }

  for (const factor of factors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
      userId,
      id: factor.id,
    });
    if (deleteError) {
      return { success: false, error: deleteError.message };
    }
  }

  revalidatePath("/team");
  revalidatePath("/", "layout");
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

  // Company-scoped only — this must never touch the global users row, or
  // deactivating someone here would deactivate them at every other company
  // they also work for.
  const membershipResult = await syncTeamMemberMembershipState(
    userId,
    actor.tenantId,
    nextActive,
  );
  if (membershipResult.error) {
    return { success: false, error: membershipResult.error };
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
    .eq("membership_id", target.membershipId)
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
    .eq("membership_id", target.membershipId)
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
        membership_id: target.membershipId,
        // The live mobile_access_tokens table still has a NOT NULL user_id
        // column (the membership_id-only cleanup migration hasn't been run
        // against production yet — see
        // supabase/migrations/20260812140000_memberships_actor_cleanup.sql).
        // Keep writing it until that migration actually lands.
        user_id: target.id,
        token_hash: tokenHash,
        token_hint: hint,
        created_by_membership_id: actor.membershipId,
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (!error && data) {
      await logAuditEvent({
        event: "mobile_token_generated",
        tenant_id: actor.tenantId,
        membership_id: actor.membershipId,
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
    .eq("membership_id", target.membershipId)
    .is("revoked_at", null)
    .select("*")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Token already revoked or not found." };

  await logAuditEvent({
    event: "mobile_token_revoked",
    tenant_id: actor.tenantId,
    membership_id: actor.membershipId,
    metadata: {
      target_user_id: userId,
      token_id: tokenId,
    },
  });
  revalidatePath("/team");
  return { data: data as MobileAccessToken, error: null };
}
