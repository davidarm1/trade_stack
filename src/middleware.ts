import { NextResponse, type NextRequest } from "next/server";
import {
  redirectWithCookies,
  updateSession,
} from "@/lib/supabase/middleware";

const LOGIN_PATH = "/login";

const PROTECTED_PREFIXES = [
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

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (user && pathname === LOGIN_PATH) {
    return redirectWithCookies(request, "/dashboard", response);
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
