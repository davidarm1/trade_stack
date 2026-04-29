import { NextResponse, type NextRequest } from "next/server";
import {
  redirectWithCookies,
  updateSession,
} from "@/lib/supabase/middleware";

const LOGIN_PATH = "/login";
const MFA_PATH = "/mfa";

const PROTECTED_PREFIXES = [
  "/account",
  "/dashboard",
  "/jobs",
  "/clients",
  "/quotes",
  "/receipts",
  "/timesheets",
  "/wages",
  "/team",
  "/settings",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never run Supabase session logic on Next internals or static assets.
  // A broad matcher can hit paths like /__nextjs_* (dev); updateSession there
  // can break RSC/dev tooling and yield a blank page.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/__nextjs") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const { response, user, mfa } = await updateSession(request);
  const needsMfa = mfa.nextLevel === "aal2" && mfa.currentLevel !== "aal2";

  if (user && pathname === LOGIN_PATH) {
    return redirectWithCookies(
      request,
      needsMfa ? MFA_PATH : "/dashboard",
      response,
    );
  }

  if (!user && pathname === MFA_PATH) {
    return redirectWithCookies(request, LOGIN_PATH, response);
  }

  if (user && pathname === MFA_PATH && !needsMfa) {
    return redirectWithCookies(request, "/dashboard", response);
  }

  if (user && needsMfa && isProtectedPath(pathname)) {
    return redirectWithCookies(request, MFA_PATH, response);
  }

  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.searchParams.set("next", pathname);
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  return response;
}

// Use Next’s recommended negative lookahead so we never run on /_next/* (CSS/JS)
// or /api. Also exclude /__nextjs/* (dev tooling); matching those caused a blank
// page when session logic ran. Do NOT add matcher: "/" alone — in practice it can
// widen to all requests and strip styles again.
export const config = {
  matcher: [
    "/((?!api|_next|__nextjs|favicon.ico).*)",
  ],
};
