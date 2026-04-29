import { NextResponse, type NextRequest } from "next/server";
import {
  redirectWithCookies,
  updateSession,
} from "@/lib/supabase/middleware";

const LOGIN_PATH = "/login";
const MFA_PATH = "/mfa";
const REQUIRED_MFA_SETUP_PATH = "/account/security?required=true";
const SECURITY_PATH = "/account/security";

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

function isMfaAllowedPath(pathname: string): boolean {
  return (
    pathname === MFA_PATH ||
    pathname === SECURITY_PATH ||
    pathname.startsWith(`${SECURITY_PATH}/`)
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

  const { response, user, role, mfa } = await updateSession(request);
  const mandatoryMfa = role === "owner" || role === "office";
  const needsMfaSetup = mandatoryMfa && !mfa.hasTotp;
  const needsMfaChallenge =
    mandatoryMfa && mfa.hasTotp && mfa.currentLevel !== "aal2";

  if (user && pathname === LOGIN_PATH) {
    return redirectWithCookies(
      request,
      needsMfaSetup
        ? REQUIRED_MFA_SETUP_PATH
        : needsMfaChallenge
          ? MFA_PATH
          : "/dashboard",
      response,
    );
  }

  if (!user && pathname === MFA_PATH) {
    return redirectWithCookies(request, LOGIN_PATH, response);
  }

  if (user && pathname === MFA_PATH && !needsMfaChallenge) {
    return redirectWithCookies(request, "/dashboard", response);
  }

  if (
    user &&
    needsMfaSetup &&
    isProtectedPath(pathname) &&
    !isMfaAllowedPath(pathname)
  ) {
    return redirectWithCookies(request, REQUIRED_MFA_SETUP_PATH, response);
  }

  if (
    user &&
    needsMfaChallenge &&
    isProtectedPath(pathname) &&
    !isMfaAllowedPath(pathname)
  ) {
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
