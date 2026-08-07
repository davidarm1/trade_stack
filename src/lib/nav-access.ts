import type { UserRole } from "@/types/database";

/** Sidebar routes each role may open (prefix match for detail pages). */
export const NAV_HREFS_BY_ROLE: Record<UserRole, readonly string[]> = {
  owner: [
    "/account/security",
    "/dashboard",
    "/collections",
    "/jobs",
    "/quotes",
    "/clients",
    "/receipts",
    "/timesheets",
    "/wages",
    "/team",
    "/vans",
    "/van-stock",
    "/store-room",
    "/email-marketing",
    "/onboarding",
    "/settings",
  ],
  office: [
    "/account/security",
    "/dashboard",
    "/collections",
    "/jobs",
    "/quotes",
    "/clients",
    "/receipts",
    "/timesheets",
    "/wages",
    "/team",
    "/vans",
    "/van-stock",
    "/store-room",
    "/email-marketing",
    "/onboarding",
    "/settings",
  ],
  engineer: [
    "/account/security",
    "/dashboard",
    "/jobs",
    "/quotes",
    "/clients",
    "/receipts",
    "/timesheets",
    "/vans",
    "/van-stock",
    "/store-room",
    "/onboarding",
  ],
  viewer: [
    "/account/security",
    "/dashboard",
    "/jobs",
    "/quotes",
    "/clients",
    "/onboarding",
  ],
};

export const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/collections", label: "This Week" },
  { href: "/jobs", label: "Jobs" },
  { href: "/quotes", label: "Quotes" },
  { href: "/clients", label: "Clients" },
  { href: "/receipts", label: "Outgoings" },
  { href: "/timesheets", label: "Timesheets" },
  { href: "/wages", label: "Wages" },
  { href: "/team", label: "Team" },
  { href: "/vans", label: "Vans" },
  { href: "/van-stock", label: "Van Stock" },
  { href: "/store-room", label: "Store Room" },
  { href: "/email-marketing", label: "Email Marketing" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/settings", label: "Settings" },
  { href: "/account/security", label: "Security" },
];

export function pathAllowedForRole(
  pathname: string,
  role: UserRole | null | undefined,
): boolean {
  const r = (role ?? "viewer") as UserRole;
  const allowed = NAV_HREFS_BY_ROLE[r] ?? NAV_HREFS_BY_ROLE.viewer;
  return allowed.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

export function navItemsForRole(
  role: UserRole | null | undefined,
): { href: string; label: string }[] {
  const r = (role ?? "viewer") as UserRole;
  const allowed = new Set(NAV_HREFS_BY_ROLE[r] ?? NAV_HREFS_BY_ROLE.viewer);
  return NAV_ITEMS.filter((item) => allowed.has(item.href));
}

/** Sidebar access summary for Team page and invite UI. */
export const TEAM_ROLE_HELP: Record<UserRole, string> = {
  owner:
    "Full access: all menus including Team, Email Marketing, and Settings. Typically the company account owner.",
  office:
    "Same menus as owner (Dashboard through Settings). Can add internal staff and manage the company.",
  engineer:
    "Dashboard, Jobs, Quotes, Clients, Outgoings, Timesheets, Vans, Store Room, Onboarding. No Wages, Team, Email Marketing, or Settings.",
  viewer:
    "Dashboard, Jobs, Quotes, Clients, Onboarding only — no outgoings, timesheets, wages, team, vans, store room, or settings.",
};
