"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  generateMobileAccessToken,
  listMobileAccessTokens,
  revokeMobileAccessToken,
  resetTeamMemberMfa,
  updateTeamMember,
} from "@/actions/team";
import { TEAM_ROLE_HELP } from "@/lib/nav-access";
import { getTeamMemberActionPermission } from "@/lib/team-member-permissions";
import { ALL_TEAM_ROLES } from "@/lib/team-roles";
import type { UserRole } from "@/types/database";

type Member = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  is_active: boolean;
};

type MobileTokenRow = {
  id: string;
  token_hint: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  used_at: string | null;
};

function roleLabel(r: UserRole) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function EditTeamMemberDialog({
  member,
  currentUserId,
  currentUserRole,
}: {
  member: Member;
  currentUserId: string;
  currentUserRole: UserRole | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [mobileTokens, setMobileTokens] = useState<MobileTokenRow[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const editPermission = getTeamMemberActionPermission({
    action: "edit",
    actorRole: currentUserRole,
    actorUserId: currentUserId,
    targetRole: member.role,
    targetUserId: member.id,
  });
  const canEditRoles = currentUserRole === "owner" && member.id !== currentUserId;
  const canToggleActive = currentUserRole === "owner" && member.id !== currentUserId;
  const resetMfaPermission = getTeamMemberActionPermission({
    action: "reset-mfa",
    actorRole: currentUserRole,
    actorUserId: currentUserId,
    targetRole: member.role,
    targetUserId: member.id,
  });
  const roleOptions: UserRole[] = ALL_TEAM_ROLES;

  if (!editPermission.allowed) {
    return (
      <button
        type="button"
        disabled
        title={editPermission.reason}
        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-400 opacity-60"
      >
        Edit
      </button>
    );
  }

  async function reloadMobileTokens() {
    const { data, error: err } = await listMobileAccessTokens(member.id);
    if (err) {
      setTokenError(err);
      return;
    }
    setMobileTokens((data ?? []) as MobileTokenRow[]);
  }

  useEffect(() => {
    if (!open) return;
    setPlainToken(null);
    setTokenError(null);
    void reloadMobileTokens();
  }, [open, member.id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const role = String(form.get("role") ?? member.role) as UserRole;
    const isActive = canToggleActive ? form.get("is_active") === "on" : member.is_active;

    const { error: err } = await updateTeamMember(member.id, {
      name: name || null,
      role,
      is_active: isActive,
    });
    setPending(false);
    if (err) {
      setError(err);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function handleGenerateMobileToken() {
    setTokenError(null);
    setTokenBusy(true);
    const { data, error: err } = await generateMobileAccessToken(member.id);
    setTokenBusy(false);
    if (err || !data) {
      setTokenError(err ?? "Could not generate token.");
      return;
    }
    setPlainToken(data.token);
    await reloadMobileTokens();
  }

  async function handleRevokeToken(tokenId: string) {
    if (!window.confirm("Revoke this mobile token?")) return;
    setTokenError(null);
    setTokenBusy(true);
    const { error: err } = await revokeMobileAccessToken(tokenId, member.id);
    setTokenBusy(false);
    if (err) {
      setTokenError(err);
      return;
    }
    await reloadMobileTokens();
  }

  async function handleResetMfa() {
    const displayName = member.name ?? member.email ?? "this user";
    const confirmed = window.confirm(
      `This will disable 2FA for ${displayName}. They will be required to set it up again on their next login. Are you sure?`,
    );
    if (!confirmed) return;

    setMfaError(null);
    setMfaMessage(null);
    setMfaBusy(true);
    const { error } = await resetTeamMemberMfa(member.id);
    setMfaBusy(false);
    if (error) {
      setMfaError(error);
      return;
    }

    setMfaMessage(
      `2FA has been reset. ${displayName} will be prompted to set it up again on next login.`,
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setMfaMessage(null);
          setMfaError(null);
        }}
        className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`edit-user-${member.id}`}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2
              id={`edit-user-${member.id}`}
              className="text-lg font-semibold text-slate-900"
            >
              Edit team member
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Update name, role, and whether they can sign in. Email is managed in Supabase Auth
              if you need to change it.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor={`edit-email-${member.id}`}
                  className="block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id={`edit-email-${member.id}`}
                  type="email"
                  readOnly
                  value={member.email ?? ""}
                  className="mt-1 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-name-${member.id}`}
                  className="block text-sm font-medium text-slate-700"
                >
                  Name
                </label>
                <input
                  id={`edit-name-${member.id}`}
                  name="name"
                  type="text"
                  defaultValue={member.name ?? ""}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Display name"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-role-${member.id}`}
                  className="block text-sm font-medium text-slate-700"
                >
                  Role
                </label>
                {canEditRoles ? (
                  <select
                    id={`edit-role-${member.id}`}
                    name="role"
                    required
                    defaultValue={member.role}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <select
                      id={`edit-role-${member.id}`}
                      name="role"
                      disabled
                      defaultValue={member.role}
                      className="mt-1 w-full cursor-not-allowed rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                    <input type="hidden" name="role" value={member.role} />
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {member.id === currentUserId
                        ? "You cannot change your own role."
                        : "Only owners can change roles."}
                    </p>
                  </>
                )}
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {roleOptions.map((r) => (
                    <span key={r} className="mb-2 block last:mb-0">
                      <span className="font-medium text-slate-800">{roleLabel(r)}:</span>{" "}
                      {TEAM_ROLE_HELP[r]}
                    </span>
                  ))}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={member.is_active}
                  disabled={!canToggleActive}
                  className="rounded border-slate-300"
                />
                <span>Active (can sign in)</span>
              </label>
              {!canToggleActive ? (
                <p className="text-xs text-slate-500">
                  Only owners can change active state here.
                </p>
              ) : null}

              {resetMfaPermission.allowed ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Two-factor authentication</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Reset this user’s 2FA so they must set it up again on next login.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleResetMfa()}
                      disabled={mfaBusy}
                      className="rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {mfaBusy ? "Resetting…" : "Reset two-factor authentication"}
                    </button>
                  </div>
                  {mfaMessage ? (
                    <p className="mt-3 text-sm text-emerald-700" role="status">
                      {mfaMessage}
                    </p>
                  ) : null}
                  {mfaError ? (
                    <p className="mt-3 text-sm text-red-600" role="alert">
                      {mfaError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">Mobile access token</p>
                <p className="mt-1 text-xs text-slate-600">
                  Office/owner can generate a one-time token for this user. A new token
                  automatically revokes any previous active token for this user and tenant.
                  Tokens do not auto-expire. Token prefix is tenant-coded to reduce cross-company
                  entry mistakes.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleGenerateMobileToken()}
                    disabled={tokenBusy}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {tokenBusy ? "Generating…" : "Generate token"}
                  </button>
                </div>
                {plainToken ? (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2">
                    <p className="text-xs text-emerald-900">
                      Share this token now (it is only shown once):
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold text-emerald-900">
                      {plainToken}
                    </p>
                  </div>
                ) : null}
                <div className="mt-3 space-y-2">
                  {mobileTokens.length === 0 ? (
                    <p className="text-xs text-slate-500">No tokens generated yet.</p>
                  ) : (
                    mobileTokens.map((t) => {
                      const active = !t.revoked_at && !t.used_at;
                      return (
                        <div
                          key={t.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-2 text-xs"
                        >
                          <div className="text-slate-700">
                            <span className="font-mono">••••{t.token_hint}</span>
                            <span className="mx-2 text-slate-400">|</span>
                            <span
                              className={
                                active
                                  ? "font-medium text-emerald-700"
                                  : t.used_at
                                    ? "font-medium text-blue-700"
                                    : "font-medium text-slate-500"
                              }
                            >
                              {active ? "Active" : t.used_at ? "Used" : "Revoked"}
                            </span>
                          </div>
                          {active ? (
                            <button
                              type="button"
                              onClick={() => void handleRevokeToken(t.id)}
                              disabled={tokenBusy}
                              className="rounded border border-red-200 px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
                {tokenError ? (
                  <p className="mt-2 text-xs text-red-600" role="alert">
                    {tokenError}
                  </p>
                ) : null}
              </div>

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
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
