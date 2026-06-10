export type AuthLinkType = "invite" | "recovery";

export function appOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit?.startsWith("http")) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function normalizeAuthNextPath(
  next: string | null | undefined,
  fallback: string,
): string {
  if (!next) return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  return trimmed;
}

export function buildAuthConfirmUrl(args: {
  tokenHash: string;
  type: AuthLinkType;
  next?: string | null;
}): string {
  const nextPath = normalizeAuthNextPath(
    args.next,
    args.type === "recovery" ? "/auth/reset-password" : "/dashboard",
  );
  const base = appOrigin();
  const params = new URLSearchParams({
    token_hash: args.tokenHash,
    type: args.type,
    next: nextPath,
  });
  return `${base}/auth/confirm?${params.toString()}`;
}
