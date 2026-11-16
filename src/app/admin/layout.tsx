import Link from "next/link";
import type { ReactNode } from "react";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Platform Admin
            </p>
            <h1 className="text-lg font-semibold text-slate-900">Trade Stack</h1>
          </div>
          <nav className="flex gap-4 text-sm font-medium text-slate-600">
            <Link href="/admin/usage" className="hover:text-slate-900">Usage</Link>
            <Link href="/admin/companies" className="hover:text-slate-900">Companies</Link>
            <Link href="/admin/staff" className="hover:text-slate-900">Staff</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
