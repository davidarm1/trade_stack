import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database";

type AuthenticatorLevel = "aal1" | "aal2" | null;

function requiresMfa(role: UserRole | null): boolean {
  return role === "owner" || role === "office";
}

export async function updateSession(
  request: NextRequest,
): Promise<{
  response: NextResponse;
  user: User | null;
  role: UserRole | null;
  mfa: {
    hasTotp: boolean;
    currentLevel: AuthenticatorLevel;
    nextLevel: AuthenticatorLevel;
  };
}> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: UserRole | null = null;
  let mfa = {
    hasTotp: false,
    currentLevel: null as AuthenticatorLevel,
    nextLevel: null as AuthenticatorLevel,
  };

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = (profile?.role as UserRole | null) ?? null;

    if (requiresMfa(role)) {
      const [{ data: factors }, { data: assurance }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      mfa = {
        hasTotp: Boolean(factors?.totp.length),
        currentLevel: assurance?.currentLevel ?? null,
        nextLevel: assurance?.nextLevel ?? null,
      };
    }
  }

  return { response: supabaseResponse, user, role, mfa };
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie);
  });
}

export function redirectWithCookies(
  request: NextRequest,
  path: string,
  sessionResponse: NextResponse,
) {
  const url = request.nextUrl.clone();
  const [pathname, search = ""] = path.split("?");
  url.pathname = pathname;
  url.search = search ? `?${search}` : "";
  const redirectResponse = NextResponse.redirect(url);
  copyCookies(sessionResponse, redirectResponse);
  return redirectResponse;
}
