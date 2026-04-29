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

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const signInRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
});

function appOriginForAuth(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit?.startsWith("http")) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Prefer the browser’s current origin so LAN/dev hosts match Supabase redirect allow list. */
async function appOriginForPasswordReset(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return u.origin;
      }
    } catch {
      /* ignore */
    }
  }
  const host =
    h.get("x-forwarded-host")?.split(",")[0]?.trim() ?? h.get("host")?.trim();
  if (host) {
    const proto =
      h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
    if (proto === "http" || proto === "https") {
      return `${proto}://${host}`;
    }
  }
  return appOriginForAuth();
}

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

async function getVerifiedTotpFactor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { factorId: null, error: error.message };
  const factor = data.totp[0];
  return { factorId: factor?.id ?? null, error: null };
}

export async function signIn(email: string, password: string) {
  const audit = await requestAuditFields();
  const normalizedEmail = email.trim().toLowerCase();
  const rateLimitResult = await signInRateLimit.limit(audit.ip);
  if (!rateLimitResult.success) {
    await logAuditEvent({
      event: "login_failure",
      ip: audit.ip,
      user_agent: audit.user_agent,
      metadata: { email: normalizedEmail, reason: "rate_limited" },
    });
    return {
      data: null,
      error: "Too many login attempts, please try again in 15 minutes.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    await logAuditEvent({
      event: "login_failure",
      ip: audit.ip,
      user_agent: audit.user_agent,
      metadata: { email: normalizedEmail, reason: error.message },
    });
    return { data: null, error: error.message };
  }
  if (!data.user) {
    return { data: null, error: "Could not sign in." };
  }
  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", data.user.id)
    .maybeSingle();
  await logAuditEvent({
    event: "login_success",
    tenant_id: profile?.tenant_id ?? null,
    user_id: data.user.id,
    ip: audit.ip,
    user_agent: audit.user_agent,
    metadata: { email: normalizedEmail },
  });
  revalidatePath("/", "layout");
  const { data: factors, error: factorsError } =
    await supabase.auth.mfa.listFactors();
  if (factorsError) {
    return { data: null, error: factorsError.message };
  }
  const redirectTo = factors.totp.length > 0 ? "/mfa" : "/dashboard";
  return { data, error: null, redirectTo };
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
) {
  const admin = createServiceRoleClient();

  // Create auth user first via Admin API so `auth.users` exists before
  // `public.users` (FK users_id_fkey → auth.users). Server `auth.signUp()`
  // can race the DB so the profile insert sometimes violates the FK.
  const { data: created, error: createAuthError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, company_name: companyName },
    });

  if (createAuthError || !created.user) {
    const msg = createAuthError?.message ?? "Could not create auth user";
    if (/already been registered|already exists/i.test(msg)) {
      return {
        data: null,
        error:
          "An account with this email already exists. Try signing in instead.",
      };
    }
    return { data: null, error: msg };
  }

  const userId = created.user.id;

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
    await admin.auth.admin.deleteUser(userId);
    return {
      data: null,
      error: tenantError?.message ?? "Failed to create tenant",
    };
  }

  const { error: userError } = await admin.from("users").insert({
    id: userId,
    tenant_id: tenant.id,
    name,
    email,
    role: "owner",
    is_active: true,
  });

  if (userError) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    await admin.auth.admin.deleteUser(userId);
    return { data: null, error: userError.message };
  }

  // Session cookies for the browser (Admin API does not create a session)
  const supabase = await createClient();
  const { error: sessionError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (sessionError) {
    return {
      data: null,
      error: `${sessionError.message} (account was created — try signing in manually)`,
    };
  }

  revalidatePath("/", "layout");
  return { data: { userId, tenantId: tenant.id }, error: null };
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
  /** Echoed so you can paste into Supabase → Auth → Redirect URLs if email fails. */
  redirectToUsed?: string;
  /**
   * Dev only: same link Supabase puts in the email (requires service role).
   * Set `DEV_SHOW_PASSWORD_RESET_LINK=true` in `.env.local`. Never in production.
   */
  devRecoveryUrl?: string;
  /** Dev-only diagnostics when the link could not be generated. */
  devRecoveryDiag?: string;
};

/** Sends Supabase password-reset email; link targets `/auth/reset-password`. */
export async function requestPasswordReset(
  email: string,
): Promise<PasswordResetResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "Enter your email address." };
  }
  const supabase = await createClient();
  const base = await appOriginForPasswordReset();
  const redirectTo = `${base.replace(/\/$/, "")}/auth/reset-password`;

  let devRecoveryUrl: string | undefined;
  let devRecoveryDiag: string | undefined;
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_SHOW_PASSWORD_RESET_LINK === "true"
  ) {
    try {
      const admin = createServiceRoleClient();
      const { data, error: glErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: trimmed,
        options: { redirectTo },
      });
      if (glErr) {
        devRecoveryDiag = glErr.message;
      } else {
        const props = data?.properties as { action_link?: string } | undefined;
        const action = props?.action_link;
        if (action) devRecoveryUrl = action;
        else devRecoveryDiag = "generateLink returned no action_link.";
      }
    } catch (e) {
      devRecoveryDiag =
        e instanceof Error
          ? e.message
          : "Could not use service role (check SUPABASE_SERVICE_ROLE_KEY).";
    }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo,
  });
  const extra = { redirectToUsed: redirectTo, devRecoveryUrl, devRecoveryDiag };
  if (error) return { error: error.message, ...extra };
  return { error: null, ...extra };
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
  const { error } = await signUp(name, companyName, email, password, plan);
  if (error) {
    const safe =
      error.length > 400 ? `${error.slice(0, 400)}…` : error;
    redirect(
      `/register?step=4&package=${packageId}&error=${encodeURIComponent(safe)}`,
    );
  }
  redirect("/dashboard");
}
