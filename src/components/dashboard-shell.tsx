"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/actions/auth";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/quotes", label: "Quotes" },
  { href: "/clients", label: "Clients" },
  { href: "/receipts", label: "Receipts" },
  { href: "/timesheets", label: "Timesheets" },
  { href: "/wages", label: "Wages" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];

export function DashboardShell({
  companyName,
  userName,
  children,
}: {
  companyName: string | null;
  userName: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
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
            <p className="truncate text-lg font-semibold text-slate-900">
              {companyName ?? "Your company"}
            </p>
            <p className="truncate text-sm text-slate-600">{userName ?? "—"}</p>
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

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col lg:pl-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            onClick={() => setOpen(true)}
            aria-expanded={open}
          >
            Menu
          </button>
          <span className="truncate text-sm font-semibold text-slate-900">
            {companyName ?? "Trade Stack"}
          </span>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
