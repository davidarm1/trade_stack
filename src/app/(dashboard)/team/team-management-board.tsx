"use client";

import { useEffect, useMemo, useState } from "react";
import { deactivateTeamMember, reactivateTeamMember, sendTeamMemberResetEmail } from "@/actions/team";
import {
  getTeamMemberActionPermission,
  teamMemberActionTitle,
} from "@/lib/team-member-permissions";
import type { UserRole, UserRow } from "@/types/database";
import { EditTeamMemberDialog } from "./edit-team-member-dialog";

type TeamMemberRow = UserRow & {
  last_sign_in_at: string | null;
  has_auth_account: boolean;
};

type Toast =
  | {
      kind: "success";
      message: string;
      action?: { label: string; onClick: () => void };
    }
  | {
      kind: "error";
      message: string;
      action?: never;
    };

function roleBadge(role: UserRole | string | null | undefined) {
  const r = String(role ?? "viewer");
  const map: Record<string, string> = {
    owner: "bg-violet-100 text-violet-900 border-violet-200",
    office: "bg-blue-100 text-blue-900 border-blue-200",
    engineer: "bg-amber-100 text-amber-900 border-amber-200",
    viewer: "bg-slate-100 text-slate-800 border-slate-200",
  };
  const cls = map[r] ?? map.viewer;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {r}
    </span>
  );
}

function pendingBadge() {
  return (
    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
      Pending
    </span>
  );
}

function statusLabel(date: string | null, hasAuthAccount: boolean) {
  if (!hasAuthAccount) return <span className="text-slate-500">—</span>;
  if (!date) return pendingBadge();
  return (
    <span className="text-slate-700">
      {new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(date))}
    </span>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(row: TeamMemberRow, query: string) {
  const q = normalize(query);
  if (!q) return true;
  return [row.name ?? "", row.email ?? ""].some((part) => normalize(part).includes(q));
}

function ActionButton({
  label,
  onClick,
  disabled,
  title,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "neutral" | "danger" | "primary";
}) {
  const toneCls =
    tone === "danger"
      ? "border-red-200 text-red-700 hover:bg-red-50"
      : tone === "primary"
        ? "bg-slate-900 text-white hover:bg-slate-800"
        : "border-slate-200 text-slate-700 hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? title : undefined}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${toneCls}`}
    >
      {label}
    </button>
  );
}

export function TeamMembersBoard({
  members,
  currentUserId,
  currentUserRole,
}: {
  members: TeamMemberRow[];
  currentUserId: string;
  currentUserRole: UserRole | null;
}) {
  const [rows, setRows] = useState<TeamMemberRow[]>(members);
  const [selectedTab, setSelectedTab] = useState<"active" | "inactive">("active");
  const [activeSearch, setActiveSearch] = useState("");
  const [inactiveSearch, setInactiveSearch] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    setRows(members);
  }, [members]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeRows = useMemo(
    () => rows.filter((row) => row.is_active).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [rows],
  );
  const inactiveRows = useMemo(
    () => rows.filter((row) => !row.is_active).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [rows],
  );

  const filteredActiveRows = useMemo(
    () => activeRows.filter((row) => matchesSearch(row, activeSearch)),
    [activeRows, activeSearch],
  );
  const filteredInactiveRows = useMemo(
    () => inactiveRows.filter((row) => matchesSearch(row, inactiveSearch)),
    [inactiveRows, inactiveSearch],
  );

  function updateLocalStatus(userId: string, nextActive: boolean) {
    setRows((prev) => prev.map((row) => (row.id === userId ? { ...row, is_active: nextActive } : row)));
  }

  async function handleReset(user: TeamMemberRow) {
    setBusyUserId(user.id);
    const { error } = await sendTeamMemberResetEmail(user.id);
    setBusyUserId(null);
    if (error) {
      setToast({ kind: "error", message: error });
      return;
    }
    setToast({ kind: "success", message: `Password reset email sent to ${user.email ?? "that user"}.` });
  }

  async function handleDeactivate(user: TeamMemberRow) {
    setBusyUserId(user.id);
    const { error } = await deactivateTeamMember(user.id);
    setBusyUserId(null);
    if (error) {
      setToast({ kind: "error", message: error });
      return;
    }
    updateLocalStatus(user.id, false);
    setConfirmDeactivateId(null);
    setToast({ kind: "success", message: `${user.name ?? user.email ?? "Team member"} deactivated.` });
  }

  async function handleReactivate(user: TeamMemberRow) {
    setBusyUserId(user.id);
    const { error } = await reactivateTeamMember(user.id);
    setBusyUserId(null);
    if (error) {
      setToast({ kind: "error", message: error });
      return;
    }
    updateLocalStatus(user.id, true);
    setToast({
      kind: "success",
      message: `${user.name ?? user.email ?? "Team member"} reactivated.`,
      action: {
        label: "Send them a reset link?",
        onClick: () => {
          setToast(null);
          void handleReset({ ...user, is_active: true });
        },
      },
    });
  }

  function renderEmptyState(message: string, colSpan: number) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500">
          {message}
        </td>
      </tr>
    );
  }

  function actionTitle(permissionReason: string) {
    return permissionReason || undefined;
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 border-b border-slate-200">
        {([
          ["active", `Active (${activeRows.length})`],
          ["inactive", `Inactive (${inactiveRows.length})`],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSelectedTab(tab)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium ${
              selectedTab === tab
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {selectedTab === "active" ? (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="team-active-search" className="block text-sm font-medium text-slate-700">
              Search active users
            </label>
            <input
              id="team-active-search"
              value={activeSearch}
              onChange={(e) => setActiveSearch(e.target.value)}
              placeholder="Search by name or email"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Last signed in</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredActiveRows.length === 0
                  ? renderEmptyState("No active users match your search.", 5)
                  : filteredActiveRows.map((row) => {
                      const canReset = getTeamMemberActionPermission({
                        action: "send-reset",
                        actorRole: currentUserRole,
                        actorUserId: currentUserId,
                        targetRole: row.role,
                        targetUserId: row.id,
                      });
                      const canDeactivate = getTeamMemberActionPermission({
                        action: "deactivate",
                        actorRole: currentUserRole,
                        actorUserId: currentUserId,
                        targetRole: row.role,
                        targetUserId: row.id,
                      });

                      const showingConfirm = confirmDeactivateId === row.id;
                      const isBusy = busyUserId === row.id;

                      return (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{row.name ?? "—"}</span>
                              {row.has_auth_account && !row.last_sign_in_at ? pendingBadge() : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{row.email ?? "—"}</td>
                          <td className="px-4 py-3">{roleBadge(row.role)}</td>
                          <td className="px-4 py-3 text-slate-700">{statusLabel(row.last_sign_in_at, row.has_auth_account)}</td>
                          <td className="px-4 py-3 text-right">
                            {showingConfirm ? (
                              <div className="inline-flex flex-wrap justify-end gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-left">
                                <div className="min-w-[16rem] text-xs text-red-900">
                                  <p className="font-medium">Deactivate {row.name ?? row.email ?? "this user"}?</p>
                                  <p className="mt-1">
                                    They will lose access immediately. This cannot be undone without reactivating them.
                                  </p>
                                </div>
                                <ActionButton
                                  label="Cancel"
                                  onClick={() => setConfirmDeactivateId(null)}
                                  disabled={isBusy}
                                />
                                <ActionButton
                                  label={isBusy ? "Deactivating…" : "Confirm"}
                                  onClick={() => void handleDeactivate(row)}
                                  disabled={isBusy}
                                  tone="danger"
                                />
                              </div>
                            ) : (
                              <div className="flex flex-wrap justify-end gap-2">
                                <EditTeamMemberDialog
                                  member={{
                                    id: row.id,
                                    name: row.name,
                                    email: row.email,
                                    role: row.role,
                                    is_active: row.is_active,
                                  }}
                                  currentUserId={currentUserId}
                                  currentUserRole={currentUserRole}
                                />
                                <ActionButton
                                  label={isBusy ? "Sending…" : "Send reset link"}
                                  onClick={() => void handleReset(row)}
                                  disabled={!canReset.allowed || isBusy}
                                  title={teamMemberActionTitle(canReset)}
                                />
                                <ActionButton
                                  label={isBusy ? "…" : "Deactivate"}
                                  onClick={() => setConfirmDeactivateId(row.id)}
                                  disabled={!canDeactivate.allowed || isBusy}
                                  title={actionTitle(canDeactivate.reason)}
                                  tone="danger"
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {selectedTab === "inactive" ? (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="team-inactive-search" className="block text-sm font-medium text-slate-700">
              Search inactive users
            </label>
            <input
              id="team-inactive-search"
              value={inactiveSearch}
              onChange={(e) => setInactiveSearch(e.target.value)}
              placeholder="Search by name or email"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Role</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInactiveRows.length === 0
                  ? renderEmptyState("No inactive users match your search.", 4)
                  : filteredInactiveRows.map((row) => {
                      const canReactivate = getTeamMemberActionPermission({
                        action: "reactivate",
                        actorRole: currentUserRole,
                        actorUserId: currentUserId,
                        targetRole: row.role,
                        targetUserId: row.id,
                      });
                      const isBusy = busyUserId === row.id;

                      return (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-700">{row.email ?? "—"}</td>
                          <td className="px-4 py-3">{roleBadge(row.role)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <ActionButton
                                label={isBusy ? "Reactivating…" : "Reactivate"}
                                onClick={() => void handleReactivate(row)}
                                disabled={!canReactivate.allowed || isBusy}
                                title={teamMemberActionTitle(canReactivate)}
                                tone="primary"
                              />
                              <EditTeamMemberDialog
                                member={{
                                  id: row.id,
                                  name: row.name,
                                  email: row.email,
                                  role: row.role,
                                  is_active: row.is_active,
                                }}
                                currentUserId={currentUserId}
                                currentUserRole={currentUserRole}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`fixed bottom-4 right-4 z-[60] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
          role={toast.kind === "success" ? "status" : "alert"}
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <p>{toast.message}</p>
            {toast.kind === "success" && toast.action ? (
              <button
                type="button"
                onClick={toast.action.onClick}
                className="shrink-0 rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
