/** Pure rules for platform support sessions (kept free of server imports for tests). */

export type SupportMode = "view" | "full";

export const SUPPORT_DEFAULT_MINUTES = 60;
export const SUPPORT_MAX_MINUTES = 240;
export const SUPPORT_MIN_REASON_LENGTH = 8;

/** View-only maps to the viewer role (read-only under RLS); full to owner. */
export function roleForSupportMode(mode: SupportMode): "viewer" | "owner" {
  return mode === "full" ? "owner" : "viewer";
}

export function parseSupportMode(value: unknown): SupportMode {
  return value === "full" ? "full" : "view";
}

export function clampSupportMinutes(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return SUPPORT_DEFAULT_MINUTES;
  return Math.min(n, SUPPORT_MAX_MINUTES);
}

export function validateSupportReason(value: unknown): { reason: string; error: string | null } {
  const reason = String(value ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < SUPPORT_MIN_REASON_LENGTH) {
    return {
      reason,
      error: `Give a reason (at least ${SUPPORT_MIN_REASON_LENGTH} characters), e.g. the ticket or what the client reported.`,
    };
  }
  return { reason: reason.slice(0, 500), error: null };
}
