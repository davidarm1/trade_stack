"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/actions/auth";
import { navItemsForRole } from "@/lib/nav-access";
import type { UserRole } from "@/types/database";

export function DashboardShell({
  companyName,
  logoUrl,
  brandingShowLogo,
  brandingShowCompanyName,
  userName,
  userRole,
  children,
}: {
  companyName: string | null;
  logoUrl?: string | null;
  /** When true and `logoUrl` is set, show the logo in sidebar / mobile header branding. */
  brandingShowLogo?: boolean;
  /** When true, show the company name alongside or instead of the logo (see branding settings). */
  brandingShowCompanyName?: boolean;
  userName: string | null;
  userRole: UserRole | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const nav = navItemsForRole(userRole);
  const showLogo = Boolean(brandingShowLogo && logoUrl);
  const showName = brandingShowCompanyName !== false;
  const hideDashboardNavigation =
    pathname === "/account/security" && searchParams.get("required") === "true";

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {!hideDashboardNavigation ? (
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white shadow-sm transition-transform lg:static lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col px-4 py-6">
            <div className="mb-8 border-b border-slate-100 pb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Trade Stack
              </p>
              {showLogo && logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="mb-2 h-12 max-w-[200px] object-contain object-left"
                />
              ) : null}
              {showName ? (
                <p className="truncate text-lg font-semibold text-slate-900">
                  {companyName ?? "Your company"}
                </p>
              ) : null}
              <p className="truncate text-sm text-slate-600">
                {userName ?? "—"}
              </p>
            </div>
            <nav className="flex flex-1 flex-col gap-1">
              {nav.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={() => handleSignOut()}
              className="mt-4 rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </aside>
      ) : null}

      {open && !hideDashboardNavigation && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col lg:pl-0">
        {hideDashboardNavigation ? (
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <span className="text-sm font-semibold text-slate-900">
              Trade Stack
            </span>
            <button
              type="button"
              onClick={() => handleSignOut()}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </header>
        ) : (
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              onClick={() => setOpen(true)}
              aria-expanded={open}
            >
              Menu
            </button>
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
              {showLogo && logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-8 w-auto max-w-[140px] shrink-0 object-contain"
                />
              ) : null}
              {showName || !showLogo ? (
                <span className="truncate">
                  {companyName ?? "Trade Stack"}
                </span>
              ) : null}
            </span>
          </header>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
