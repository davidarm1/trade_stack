/** Fetch remote logo image bytes for PDF embedding (server-side). */
export async function fetchLogoBytes(logoUrl: string | null): Promise<{
  bytes: Uint8Array | null;
  mime: string;
}> {
  const url = String(logoUrl ?? "").trim();
  if (!url) return { bytes: null, mime: "" };
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { bytes: null, mime: "" };
    const mime = res.headers.get("content-type") ?? "";
    const arr = new Uint8Array(await res.arrayBuffer());
    return { bytes: arr, mime };
  } catch {
    return { bytes: null, mime: "" };
  }
}
