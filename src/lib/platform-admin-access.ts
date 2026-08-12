/**
 * Pure authorization decisions for the platform-admin allowlist.
 * Used by requirePlatformAdmin and by unit tests — keeps Next redirects out of tests.
 *
 * Platform admin is independent of public.users.role / tenant membership.
 * The memberships migration is introducing multi-membership support; this allowlist remains separate.
 */

export type PlatformAdminAccess =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ok"; userId: string };

export function evaluatePlatformAdminAccess(args: {
  userId: string | null | undefined;
  isAllowlisted: boolean;
}): PlatformAdminAccess {
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!userId) {
    return { status: "unauthenticated" };
  }
  if (!args.isAllowlisted) {
    return { status: "forbidden" };
  }
  return { status: "ok", userId };
}

/** Paths that must independently call requirePlatformAdmin (layout is not enough for APIs). */
export const PLATFORM_ADMIN_API_ROUTES = [
  "/api/admin/refresh-storage-stats",
] as const;
