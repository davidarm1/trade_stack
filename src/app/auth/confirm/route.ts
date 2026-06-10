import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeAuthNextPath,
  type AuthLinkType,
} from "@/lib/auth-links";

function redirectTo(target: string, request: NextRequest) {
  return NextResponse.redirect(new URL(target, request.url));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as AuthLinkType | null;
  const next = url.searchParams.get("next");

  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return redirectTo("/login?error=invalid_auth_link", request);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    const fallback = type === "recovery" ? "/forgot-password" : "/login";
    const message = encodeURIComponent(error.message || "invalid_auth_link");
    return redirectTo(`${fallback}?error=${message}`, request);
  }

  const target = normalizeAuthNextPath(
    next,
    type === "recovery" ? "/auth/reset-password" : "/dashboard",
  );
  return redirectTo(target, request);
}
