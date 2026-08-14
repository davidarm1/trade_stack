"use server";

import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isTestPaymentApproved,
  tenantPlanValue,
  type PackageId,
} from "@/lib/plans";
import {
  generateAndSendCompanySetupLink,
  generateAndSendPasswordResetEmail,
} from "@/lib/password-reset";
import type { UserRole } from "@/types/database";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const signInRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
});



function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 63);
  return s || "tenant";
}

async function requestAuditFields() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    user_agent: h.get("user-agent") ?? null,
  };
}

function normalizeMfaCode(code: string): string {
  return code.replace(/\s+/g, "");
}

function requiresMfa(role: UserRole | null | undefined): boolean {
  return role === "owner" || role === "office";
}

async function getVerifiedTotpFactor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { factorId: null, error: error.message };
  const factor = data.totp[0];
  return { factorId: factor?.id ?? null, error: null };
}

export async function signIn(email: string, password: string) {
  try {
    const startedAt = Date.now();
    const mark = (step: string, extra?: Record<string, unknown>) => {
      console.info("[auth] signIn step", {
        step,
        ms: Date.now() - startedAt,
        ...(extra ?? {}),
      });
    };

    const audit = await requestAuditFields();
    mark("request-audit-fields");

    const normalizedEmail = email.trim().toLowerCase();
    const rateLimitResult = await signInRateLimit.limit(audit.ip);
    mark("rate-limit", { allowed: rateLimitResult.success });
    if (!rateLimitResult.success) {
      await logAuditEvent({
        event: "login_failure",
        ip: audit.ip,
        user_agent: audit.user_agent,
        metadata: { email: normalizedEmail, reason: "rate_limited" },
      });
      mark("audit-login-failure-rate-limited");
      return {
        data: null,
        error: "Too many login attempts, please try again in 15 minutes.",
      };
    }

    const supabase = await createClient();
    mark("create-client");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    mark("sign-in-with-password", { success: !error, hasUser: Boolean(data.user) });
    if (error) {
      await logAuditEvent({
        event: "login_failure",
        ip: audit.ip,
        user_agent: audit.user_agent,
        metadata: { email: normalizedEmail, reason: error.message },
      });
      mark("audit-login-failure");
      return { data: null, error: error.message };
    }
    if (!data.user) {
      mark("missing-user");
      return { data: null, error: "Could not sign in." };
    }
    const { data: profile } = await supabase
      .from("users")
      .select("tenant_id, role")
      .eq("id", data.user.id)
      .maybeSingle();
    mark("load-profile", { role: profile?.role ?? null });

    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", data.user.id)
      .eq("company_id", profile?.tenant_id ?? "")
      .maybeSingle();

    await logAuditEvent({
      event: "login_success",
      tenant_id: profile?.tenant_id ?? null,
      membership_id: membership?.id ?? null,
      ip: audit.ip,
      user_agent: audit.user_agent,
      metadata: { email: normalizedEmail },
    });
    mark("audit-login-success");

    revalidatePath("/", "layout");
    mark("revalidate-root-layout");

    const role = (profile?.role as UserRole | null) ?? null;
    if (!requiresMfa(role)) {
      mark("redirect-dashboard");
      return { data, error: null, redirectTo: "/dashboard" };
    }

    const { data: factors, error: factorsError } =
      await supabase.auth.mfa.listFactors();
    mark("list-factors", { success: !factorsError, totpCount: factors?.totp?.length ?? null });
    if (factorsError) return { data: null, error: factorsError.message };

    const redirectTo =
      factors.totp.length > 0 ? "/mfa" : "/account/security?required=true";
    mark("redirect-mfa", { redirectTo });
    return { data, error: null, redirectTo };
  } catch (cause) {
    console.error("[auth] signIn failed unexpectedly", cause);
    return {
      data: null,
      error: "Could not sign in. Please try again.",
    };
  }
}

export async function getMfaStatus() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { data: null, error: "You must be signed in to manage MFA." };
  }

  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { data: null, error: error.message };

  const factor = data.totp[0];
  return {
    data: {
      enrolled: Boolean(factor),
      factorId: factor?.id ?? null,
    },
    error: null,
  };
}

export async function enrollMfa() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { data: null, error: "You must be signed in to enable MFA." };
  }

  const existing = await supabase.auth.mfa.listFactors();
  if (existing.error) return { data: null, error: existing.error.message };
  if (existing.data.totp.length > 0) {
    return {
      data: null,
      error: "Two-factor authentication is already enabled.",
    };
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Trade Stack",
    issuer: "Trade Stack",
  });
  if (error) return { data: null, error: error.message };

  return {
    data: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
    error: null,
  };
}

export async function verifyMfaEnrollment(factorId: string, code: string) {
  const token = normalizeMfaCode(code);
  if (!factorId || !/^\d{6}$/.test(token)) {
    return { data: null, error: "Enter the 6-digit code from your app." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: token,
  });
  if (error) return { data: null, error: "Invalid code, please try again" };

  revalidatePath("/account/security");
  return { data: true, error: null };
}

export async function removeMfa(factorId: string) {
  if (!factorId) {
    return { data: null, error: "No MFA factor was found." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { data: null, error: error.message };

  revalidatePath("/account/security");
  return { data: true, error: null };
}

export async function verifyMfaChallenge(code: string) {
  const token = normalizeMfaCode(code);
  if (!/^\d{6}$/.test(token)) {
    return { data: null, error: "Invalid code, please try again" };
  }

  const { factorId, error: factorError } = await getVerifiedTotpFactor();
  if (factorError || !factorId) {
    return {
      data: null,
      error: factorError ?? "No two-factor authentication factor was found.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: token,
  });
  if (error) return { data: null, error: "Invalid code, please try again" };

  revalidatePath("/", "layout");
  return { data: true, error: null };
}

export async function signUp(
  name: string,
  companyName: string,
  email: string,
  password: string,
  /** e.g. `core_monthly` | `pro_monthly` from `tenantPlanValue()` */
  plan: string,
  packageId: string,
) {
  const admin = createServiceRoleClient();
  const now = new Date().toISOString();

  const createAuthResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, company_name: companyName },
  });

  let userId: string | null = null;
  let needsSessionSignIn = false;

  if (createAuthResult.error || !createAuthResult.data.user) {
    const msg = createAuthResult.error?.message ?? "Could not create auth user";
    if (!/already been registered|already exists/i.test(msg)) {
      return { data: null, error: msg };
    }

    const { data: existingUser } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingUser?.id) {
      await admin.auth.admin.updateUserById(existingUser.id, {
        ban_duration: "none",
      });
    }

    const supabase = await createClient();
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });
    if (signInError || !signInData.user) {
      if (/invalid login credentials/i.test(signInError?.message ?? "")) {
        const setupLinkResult = await generateAndSendCompanySetupLink(
          email,
          `/register?step=4&package=${packageId}`,
        );
        if (!setupLinkResult.error) {
          return {
            data: null,
            error:
              "We couldn’t verify that password, so we emailed you a link to continue setup. Open that email, choose a new password, then try the company signup again.",
          };
        }
      }
      return {
        data: null,
        error: signInError?.message ?? "Could not sign in with the existing account.",
      };
    }

    userId = signInData.user.id;
  } else {
    userId = createAuthResult.data.user.id;
    needsSessionSignIn = true;
  }

  const provisionCompany = async (resolvedUserId: string) => {
    let slug = slugify(companyName);
    const { data: dup } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (dup) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .insert({
        name: companyName,
        slug,
        plan,
        is_active: true,
      })
      .select("id")
      .single();

    if (tenantError || !tenant) {
      return { data: null, error: tenantError?.message ?? "Failed to create tenant" };
    }

    const now = new Date().toISOString();

    const profilePatch = {
      id: resolvedUserId,
      tenant_id: tenant.id,
      name,
      email,
      role: "owner" as const,
      is_active: true,
      leaver_at: null,
      updated_at: now,
    };

    const { error: userError } = await admin.from("users").upsert(profilePatch, {
      onConflict: "id",
    });
    if (userError) {
      await admin.from("tenants").delete().eq("id", tenant.id);
      return { data: null, error: userError.message };
    }


    const { error: liveMembershipError } = await admin
      .from("memberships")
      .select("id")
      .eq("user_id", resolvedUserId)
      .in("status", ["active", "invited"])
      .eq("concurrent_allowed", false);
    if (liveMembershipError) {
      await admin.from("users").delete().eq("id", resolvedUserId).eq("tenant_id", tenant.id);
      await admin.from("tenants").delete().eq("id", tenant.id);
      return { data: null, error: liveMembershipError.message };
    }

    const { data: liveMemberships, error: liveMembershipsError } = await admin
      .from("memberships")
      .select("id, company_id")
      .eq("user_id", resolvedUserId)
      .in("status", ["active", "invited"])
      .eq("concurrent_allowed", false);
    if (liveMembershipsError) {
      await admin.from("users").delete().eq("id", resolvedUserId).eq("tenant_id", tenant.id);
      await admin.from("tenants").delete().eq("id", tenant.id);
      return { data: null, error: liveMembershipsError.message };
    }

    for (const liveMembership of liveMemberships ?? []) {
      if (liveMembership.company_id === tenant.id) continue;
      const { error: revokeError } = await admin
        .from("memberships")
        .update({ status: "leaver", updated_at: now })
        .eq("id", liveMembership.id);
      if (revokeError) {
        await admin.from("users").delete().eq("id", resolvedUserId).eq("tenant_id", tenant.id);
        await admin.from("tenants").delete().eq("id", tenant.id);
        return { data: null, error: revokeError.message };
      }
      await admin
        .from("membership_spells")
        .update({ left_at: now, updated_at: now })
        .eq("membership_id", liveMembership.id)
        .is("left_at", null);
    }

    const { data: existingMembership, error: existingMembershipError } = await admin
      .from("memberships")
      .select("id")
      .eq("user_id", resolvedUserId)
      .eq("company_id", tenant.id)
      .maybeSingle();

    if (existingMembershipError) {
      await admin.from("users").delete().eq("id", resolvedUserId).eq("tenant_id", tenant.id);
      await admin.from("tenants").delete().eq("id", tenant.id);
      return { data: null, error: existingMembershipError.message };
    }

    let membershipId = existingMembership?.id ?? null;
    if (membershipId) {
      const { error: membershipUpdateError } = await admin
        .from("memberships")
        .update({
          role: "owner",
          status: "active",
          display_name: name,
          job_title: null,
          employee_ref: null,
          work_phone: null,
          concurrent_allowed: false,
          updated_at: now,
        })
        .eq("id", membershipId);
      if (membershipUpdateError) {
        await admin.from("users").delete().eq("id", resolvedUserId).eq("tenant_id", tenant.id);
        await admin.from("tenants").delete().eq("id", tenant.id);
        return { data: null, error: membershipUpdateError.message };
      }
    } else {
      const { data: membership, error: membershipError } = await admin
        .from("memberships")
        .insert({
          user_id: resolvedUserId,
          company_id: tenant.id,
          role: "owner",
          status: "active",
          display_name: name,
          job_title: null,
          employee_ref: null,
          work_phone: null,
          concurrent_allowed: false,
        })
        .select("id")
        .single();

      if (membershipError || !membership) {
        await admin.from("users").delete().eq("id", resolvedUserId).eq("tenant_id", tenant.id);
        await admin.from("tenants").delete().eq("id", tenant.id);
        return {
          data: null,
          error: membershipError?.message ?? "Failed to create company membership",
        };
      }
      membershipId = membership.id;
    }

    const { data: openSpell } = await admin
      .from("membership_spells")
      .select("id")
      .eq("membership_id", membershipId)
      .is("left_at", null)
      .maybeSingle();

    if (!openSpell) {
      const { error: spellError } = await admin.from("membership_spells").insert({
        membership_id: membershipId,
        joined_at: now,
        left_at: null,
        created_at: now,
        updated_at: now,
      });
      if (spellError) {
        await admin.from("memberships").delete().eq("id", membershipId);
        await admin.from("users").delete().eq("id", resolvedUserId).eq("tenant_id", tenant.id);
        await admin.from("tenants").delete().eq("id", tenant.id);
        return { data: null, error: spellError.message };
      }
    }

    return { data: { tenantId: tenant.id, userId: resolvedUserId }, error: null };
  };

  const provisioned = await provisionCompany(userId);
  if (provisioned.error || !provisioned.data) {
    if (needsSessionSignIn && userId) {
      // Existing-account sign-in already happened; keep the signed-in state.
    } else if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
    return { data: null, error: provisioned.error ?? "Failed to provision company" };
  }

  if (needsSessionSignIn) {
    const supabase = await createClient();
    const { error: sessionError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (sessionError) {
      await admin.from("memberships").delete().eq("user_id", userId).eq("company_id", provisioned.data.tenantId);
      await admin.from("users").delete().eq("id", userId).eq("tenant_id", provisioned.data.tenantId);
      await admin.from("tenants").delete().eq("id", provisioned.data.tenantId);
      await admin.auth.admin.deleteUser(userId);
      return {
        data: null,
        error: `${sessionError.message} (account was created — try signing in manually)`,
      };
    }
  }

  revalidatePath("/", "layout");
  return { data: { userId, tenantId: provisioned.data.tenantId }, error: null };
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { data: null, error: error.message };
  revalidatePath("/", "layout");
  return { data: true, error: null };
}

type PasswordResetResult = {
  error: string | null;
};

type PasswordUpdateResult = {
  error: string | null;
  redirectTo: string | null;
};

export async function updatePassword(password: string): Promise<PasswordUpdateResult> {
  if (!password) {
    return { error: "Enter a new password.", redirectTo: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    const message = error.message || "Could not update password.";
    if (/AAL2 session is required to update email or password when MFA is enabled/i.test(message)) {
      return {
        error: null,
        redirectTo: "/auth/mfa-challenge?next=/auth/reset-password",
      };
    }
    return { error: message, redirectTo: null };
  }

  revalidatePath("/", "layout");
  return { error: null, redirectTo: "/dashboard" };
}

/** Sends password-reset email via Resend; link targets `/auth/reset-password`. */
export async function requestPasswordReset(
  email: string,
): Promise<PasswordResetResult> {
  return generateAndSendPasswordResetEmail(email);
}

/** Register wizard — test payment step (no card data in URL). */
export async function submitRegisterTestPayment(formData: FormData) {
  const packageId = String(formData.get("packageId") ?? "");
  if (packageId !== "core" && packageId !== "pro") redirect("/register");
  const cardNumber = String(formData.get("cardNumber") ?? "");
  if (!isTestPaymentApproved(cardNumber)) {
    redirect(`/register?step=3&package=${packageId}&declined=1`);
  }
  redirect(`/register?step=4&package=${packageId}`);
}

/** Register wizard — create tenant + owner after package / fake checkout. */
export async function signUpFromRegisterForm(formData: FormData) {
  const packageId = String(formData.get("packageId") ?? "");
  if (packageId !== "core" && packageId !== "pro") redirect("/register");
  const plan = tenantPlanValue(packageId as PackageId, "monthly");
  const name = String(formData.get("name") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !companyName || !email || !password) {
    redirect(
      `/register?step=4&package=${packageId}&error=${encodeURIComponent("Please fill in all fields.")}`,
    );
  }
  const { error } = await signUp(name, companyName, email, password, plan, packageId);
  if (error) {
    const safe =
      error.length > 400 ? `${error.slice(0, 400)}…` : error;
    redirect(
      `/register?step=4&package=${packageId}&error=${encodeURIComponent(safe)}`,
    );
  }
  redirect("/dashboard");
}
