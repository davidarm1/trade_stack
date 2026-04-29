import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getSessionTenantOrError } from "@/lib/api-auth";
import { logAuditEvent } from "@/lib/audit";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN ?? "http://localhost:8081",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const redeemTokenRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
});

const invalidTokenResponse = { error: "Invalid or expired token" };

type AuditContext = {
  ip: string;
  user_agent: string | null;
};

function hashTokenForTenant(token: string, tenantId: string): string {
  return createHash("sha256").update(`${tenantId}:${token}`).digest("hex");
}

function tenantTokenPrefix(tenantId: string): string {
  const compact = tenantId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return (compact.slice(0, 4) || "TENX").padEnd(4, "X");
}

function tokenPrefix(token: string): string {
  return token.replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...init?.headers,
    },
  });
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}

function requestAuditContext(request: Request): AuditContext {
  return {
    ip: clientIp(request),
    user_agent: request.headers.get("user-agent"),
  };
}

async function logMobileRedemptionFailure(args: {
  request: Request;
  reason: string;
  token?: string;
  tenant_id?: string | null;
  user_id?: string | null;
}) {
  const audit = requestAuditContext(args.request);
  await logAuditEvent({
    event: "mobile_token_redemption_failed",
    tenant_id: args.tenant_id ?? null,
    user_id: args.user_id ?? null,
    ip: audit.ip,
    user_agent: audit.user_agent,
    metadata: {
      reason: args.reason,
      token_prefix: args.token ? tokenPrefix(args.token) : null,
    },
  });
}

async function invalidToken(request: Request, token: string, reason: string) {
  await logMobileRedemptionFailure({ request, token, reason });
  return json(invalidTokenResponse, { status: 404 });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const rateLimitResult = await redeemTokenRateLimit.limit(clientIp(request));
  if (!rateLimitResult.success) {
    await logMobileRedemptionFailure({ request, reason: "rate_limited" });
    return json(
      { error: "Too many attempts, please try again later" },
      { status: 429 },
    );
  }

  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    await logMobileRedemptionFailure({ request, reason: "invalid_json" });
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim().toUpperCase();
  if (!token) {
    await logMobileRedemptionFailure({ request, reason: "missing_token" });
    return json({ error: "Token is required" }, { status: 400 });
  }

  const hasBearer = /^Bearer\s+.+/i.test(request.headers.get("authorization") ?? "");
  if (!hasBearer) {
    return redeemTokenForMobileSession(token, request);
  }

  const session = await getSessionTenantOrError();
  if (!session.ok) {
    const status = session.response.status;
    const fallback = status === 401 ? "Unauthorized" : "Could not redeem token";
    let error = fallback;
    try {
      const payload = (await session.response.json()) as { error?: string };
      error = payload.error ?? fallback;
    } catch {
      // Keep fallback message.
    }
    await logMobileRedemptionFailure({
      request,
      token,
      reason: error,
    });
    return json({ error }, { status });
  }

  const { supabase, tenantId, userId } = session;
  const tokenHash = hashTokenForTenant(token, tenantId);
  const nowIso = new Date().toISOString();

  const { data: row, error } = await supabase
    .from("mobile_access_tokens")
    .select("id, revoked_at, used_at, expires_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  if (!row) return invalidToken(request, token, "not_found");
  if (row.revoked_at || row.used_at) {
    return invalidToken(request, token, row.revoked_at ? "revoked" : "used");
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return invalidToken(request, token, "expired");
  }

  const { data: redeemed, error: updErr } = await supabase
    .from("mobile_access_tokens")
    .update({ used_at: nowIso })
    .eq("id", row.id)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (updErr) return json({ error: updErr.message }, { status: 500 });
  if (!redeemed) return invalidToken(request, token, "already_redeemed");
  const audit = requestAuditContext(request);
  await logAuditEvent({
    event: "mobile_token_redeemed",
    tenant_id: tenantId,
    user_id: userId,
    ip: audit.ip,
    user_agent: audit.user_agent,
    metadata: { mode: "bearer" },
  });
  return json({ success: true });
}

async function redeemTokenForMobileSession(token: string, request: Request) {
  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const prefix = tokenPrefix(token);

  const { data: tenants, error: tenantError } = await admin
    .from("tenants")
    .select("id");
  if (tenantError) return json({ error: tenantError.message }, { status: 500 });

  const tenantIds = (tenants ?? [])
    .map((tenant) => String(tenant.id))
    .filter((tenantId) => tenantTokenPrefix(tenantId) === prefix);

  let match: {
    id: string;
    tenant_id: string;
    user_id: string;
    expires_at: string | null;
    revoked_at: string | null;
    used_at: string | null;
  } | null = null;

  for (const tenantId of tenantIds) {
    const tokenHash = hashTokenForTenant(token, tenantId);
    const { data: row, error: lookupError } = await admin
      .from("mobile_access_tokens")
      .select("id, tenant_id, user_id, expires_at, revoked_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (lookupError) return json({ error: lookupError.message }, { status: 500 });
    if (row) {
      match = row;
      break;
    }
  }

  if (!match) return invalidToken(request, token, "not_found");
  if (match.revoked_at || match.used_at) {
    return invalidToken(request, token, match.revoked_at ? "revoked" : "used");
  }
  if (match.expires_at && new Date(match.expires_at).getTime() < Date.now()) {
    return invalidToken(request, token, "expired");
  }

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("email, is_active")
    .eq("id", match.user_id)
    .eq("tenant_id", match.tenant_id)
    .maybeSingle();
  if (profileError) return json({ error: profileError.message }, { status: 500 });
  if (!profile?.email) return invalidToken(request, token, "missing_profile_email");
  if (profile.is_active === false) {
    await logMobileRedemptionFailure({
      request,
      token,
      reason: "account_inactive",
      tenant_id: match.tenant_id,
      user_id: match.user_id,
    });
    return json({ error: "Account inactive" }, { status: 403 });
  }

  const { data: redeemed, error: updErr } = await admin
    .from("mobile_access_tokens")
    .update({ used_at: nowIso })
    .eq("id", match.id)
    .eq("tenant_id", match.tenant_id)
    .eq("user_id", match.user_id)
    .is("revoked_at", null)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (updErr) return json({ error: updErr.message }, { status: 500 });
  if (!redeemed) return invalidToken(request, token, "already_redeemed");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
  });
  if (linkError) return json({ error: linkError.message }, { status: 500 });

  const properties = link.properties as { hashed_token?: string } | undefined;
  if (!properties?.hashed_token) {
    return json({ error: "Could not create mobile session token" }, { status: 500 });
  }

  const audit = requestAuditContext(request);
  await logAuditEvent({
    event: "mobile_token_redeemed",
    tenant_id: match.tenant_id,
    user_id: match.user_id,
    ip: audit.ip,
    user_agent: audit.user_agent,
    metadata: { mode: "magiclink" },
  });

  return json({
    success: true,
    auth: {
      email: profile.email,
      tokenHash: properties.hashed_token,
      type: "magiclink",
    },
  });
}
