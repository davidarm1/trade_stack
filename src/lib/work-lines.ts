/**
 * Split free-text "work carried out" notes into one entry per line, dropping
 * blank lines and leading bullet/number markers ("* ", "- ", "• ", "1. ").
 */
export function parseWorkLines(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*(?:[*\-•–]|\d+[.)])\s+/u, "").trim())
    .filter(Boolean);
}
