import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

type AuthenticatorLevel = "aal1" | "aal2" | null;

export async function updateSession(
  request: NextRequest,
): Promise<{
  response: NextResponse;
  user: User | null;
  mfa: {
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

  let mfa = {
    currentLevel: null as AuthenticatorLevel,
    nextLevel: null as AuthenticatorLevel,
  };

  if (user) {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    mfa = {
      currentLevel: data?.currentLevel ?? null,
      nextLevel: data?.nextLevel ?? null,
    };
  }

  return { response: supabaseResponse, user, mfa };
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie);
  });
}

export function redirectWithCookies(
  request: NextRequest,
  pathname: string,
  sessionResponse: NextResponse,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const redirectResponse = NextResponse.redirect(url);
  copyCookies(sessionResponse, redirectResponse);
  return redirectResponse;
}
