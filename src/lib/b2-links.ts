import { publicUrlForB2Key } from "@/lib/b2";

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Extract a B2 object key from a legacy public URL or accept a bare key.
 *
 * Supported legacy shapes:
 * - https://<endpoint>/<bucket>/<key>
 * - https://f005.backblazeb2.com/file/<bucket>/<key>
 * - a bare key already in tradestack/<tenant>/... form
 */
export function normalizeB2ObjectKey(input: string | null | undefined): string | null {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return null;

  const decoded = safeDecodeURIComponent(trimmed);

  if (/^https?:\/\//i.test(decoded)) {
    return b2KeyFromPublicUrl(decoded);
  }

  if (decoded.startsWith("/api/files/download?")) {
    const params = new URLSearchParams(decoded.split("?")[1] ?? "");
    const key = params.get("key");
    if (key) return normalizeB2ObjectKey(key);
  }

  if (decoded.startsWith("api/files/download?")) {
    const params = new URLSearchParams(decoded.split("?")[1] ?? "");
    const key = params.get("key");
    if (key) return normalizeB2ObjectKey(key);
  }

  const key = decoded.replace(/^\/+/, "");
  if (!key.startsWith("tradestack/")) return null;
  if (key.includes("\\")) return null;
  const segments = key.split("/");
  if (segments.length < 3) return null;
  if (segments.some((segment) => segment === "." || segment === ".." || segment === "")) {
    return null;
  }
  return key;
}

export function publicUrlFromStoredValue(value: string | null | undefined): string | null {
  const key = normalizeB2ObjectKey(value);
  return key ? publicUrlForB2Key(key) : null;
}

export function b2KeyFromPublicUrl(publicUrl: string): string | null {
  const trimmed = String(publicUrl ?? "").trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);
    let path = safeDecodeURIComponent(u.pathname).replace(/^\/+/, "");
    if (!path) return null;

    const segments = path.split("/").filter(Boolean);
    if (segments.length < 2) return null;

    if (segments[0] === "file" && segments.length >= 3) {
      return segments.slice(2).join("/");
    }

    return segments.slice(1).join("/");
  } catch {
    const path = safeDecodeURIComponent(trimmed).replace(/^\/+/, "");
    if (!path) return null;
    if (path.startsWith("tradestack/")) return path;
    return null;
  }
}

export function b2DownloadPathForKey(key: string): string {
  return `/api/files/download?key=${encodeURIComponent(key)}`;
}

export function b2DownloadPathFromStoredValue(value: string | null | undefined): string | null {
  const key = normalizeB2ObjectKey(value);
  return key ? b2DownloadPathForKey(key) : null;
}
