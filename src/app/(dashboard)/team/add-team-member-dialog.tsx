"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inviteTeamMember } from "@/actions/team";
import { TEAM_ROLE_HELP } from "@/lib/nav-access";
import type { UserRole } from "@/types/database";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "office", label: "Office" },
  { value: "engineer", label: "Engineer" },
  { value: "viewer", label: "Viewer" },
];

export function AddTeamMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const name = String(form.get("name") ?? "");
    const role = String(form.get("role") ?? "") as UserRole;

    const { error: err } = await inviteTeamMember(email, name, role);
    setPending(false);
    if (err) {
      setError(err);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Add users
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="add-user-title"
              className="text-lg font-semibold text-slate-900"
            >
              Add user
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              They will receive an email to set a password. Choose a role to
              control which menus they can use.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="add-user-email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="add-user-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="add-user-name"
                  className="block text-sm font-medium text-slate-700"
                >
                  Name
                </label>
                <input
                  id="add-user-name"
                  name="name"
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label
                  htmlFor="add-user-role"
                  className="block text-sm font-medium text-slate-700"
                >
                  Role
                </label>
                <select
                  id="add-user-role"
                  name="role"
                  required
                  defaultValue="engineer"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {ROLE_OPTIONS.map((o) => (
                    <span key={o.value} className="mb-2 block last:mb-0">
                      <span className="font-medium text-slate-800">
                        {o.label}:
                      </span>{" "}
                      {TEAM_ROLE_HELP[o.value]}
                    </span>
                  ))}
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {pending ? "Sending…" : "Send invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
