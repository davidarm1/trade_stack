import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export type SessionTenantResult =
  | {
      ok: true;
      supabase: SupabaseClient;
      userId: string;
      tenantId: string;
      role: UserRole | null;
    }
  | { ok: false; response: NextResponse };

/**
 * Resolves the signed-in user + tenant for API routes.
 * - Prefer `Authorization: Bearer <supabase_access_token>` (mobile / non-cookie clients).
 * - Otherwise uses the cookie-backed server Supabase client (web browser).
 */
export async function getSessionTenantOrError(): Promise<SessionTenantResult> {
  const headerList = await headers();
  const rawAuth = headerList.get("authorization") ?? headerList.get("Authorization");
  const bearer = rawAuth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Server misconfigured" }, { status: 500 }),
    };
  }

  if (bearer) {
    const supabase = createSupabaseJsClient(url, anon, {
      global: {
        headers: { Authorization: `Bearer ${bearer}` },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("tenant_id, is_active, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.tenant_id) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "No tenant profile for this user" },
          { status: 403 },
        ),
      };
    }
    if (profile.is_active === false) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Account inactive" }, { status: 403 }),
      };
    }

    return {
      ok: true,
      supabase,
      userId: user.id,
      tenantId: profile.tenant_id,
      role: (profile.role as UserRole | null) ?? null,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("tenant_id, is_active, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.tenant_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No tenant profile for this user" },
        { status: 403 },
      ),
    };
  }
  if (profile.is_active === false) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Account inactive" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    tenantId: profile.tenant_id,
    role: (profile.role as UserRole | null) ?? null,
  };
}

export function rejectForeignTenantId(
  bodyTenantId: string | undefined,
  sessionTenantId: string,
): NextResponse | null {
  if (bodyTenantId != null && bodyTenantId !== sessionTenantId) {
    return NextResponse.json(
      { error: "tenantId does not match signed-in tenant" },
      { status: 403 },
    );
  }
  return null;
}
