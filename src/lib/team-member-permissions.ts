import type { UserRole } from "@/types/database";

export type TeamMemberAction = "edit" | "send-reset" | "deactivate" | "reactivate";

export type TeamMemberActionPermission = {
  allowed: boolean;
  reason: string;
};

function sameUserReason(): TeamMemberActionPermission {
  return {
    allowed: false,
    reason: "You cannot perform this action on your own account.",
  };
}

export function getTeamMemberActionPermission(args: {
  action: TeamMemberAction;
  actorRole: UserRole | null | undefined;
  actorUserId: string;
  targetRole: UserRole;
  targetUserId: string;
}): TeamMemberActionPermission {
  const { action, actorRole, actorUserId, targetRole, targetUserId } = args;

  if (!actorRole) {
    return { allowed: false, reason: "You must be signed in." };
  }
  if (actorUserId === targetUserId) {
    return sameUserReason();
  }

  if (action === "deactivate" || action === "reactivate") {
    if (actorRole !== "owner") {
      return {
        allowed: false,
        reason: "Only owners can deactivate or reactivate team members.",
      };
    }
    return { allowed: true, reason: "" };
  }

  const officeCanTarget = targetRole === "engineer" || targetRole === "viewer";

  if (action === "send-reset") {
    if (actorRole === "owner") return { allowed: true, reason: "" };
    if (actorRole === "office" && officeCanTarget) return { allowed: true, reason: "" };
    return {
      allowed: false,
      reason:
        "Office staff can only send reset links to engineers and viewers. Owners can send to anyone except themselves.",
    };
  }

  if (action === "edit") {
    if (actorRole === "owner") return { allowed: true, reason: "" };
    if (actorRole === "office" && officeCanTarget) return { allowed: true, reason: "" };
    return {
      allowed: false,
      reason:
        "Office staff can only edit engineers and viewers. Owners can edit anyone except themselves.",
    };
  }

  return { allowed: false, reason: "This action is not permitted." };
}

export function teamMemberActionTitle(permission: TeamMemberActionPermission): string {
  return permission.allowed ? "" : permission.reason;
}
