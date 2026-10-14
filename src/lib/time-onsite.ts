/**
 * jobs.time_onsite is a Postgres `time` column, but the forms invite
 * free-text entry ("2pm", "9-11am") and the AI parser can return the same.
 * Convert whatever was typed into a value Postgres accepts ("HH:MM") before
 * it reaches the insert/update; a range keeps its start time.
 */

const TIME_RE = /^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*([ap])?\.?m?\.?$/i;

function parseSingle(
  part: string,
  fallbackMeridiem: "a" | "p" | null,
): string | null {
  const m = TIME_RE.exec(part.trim());
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const meridiem = (m[3]?.toLowerCase() as "a" | "p" | undefined) ?? fallbackMeridiem;
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "p" && hours < 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeTimeOnsite(
  raw: string | null | undefined,
): { value: string | null; error: string | null } {
  const text = (raw ?? "").trim();
  if (!text) return { value: null, error: null };

  const [startRaw, endRaw] = text.split(/\s*(?:-|–|—|to)\s*/i);
  // "9-11am": the start inherits am/pm from the end when it has none.
  const endMeridiem = endRaw ? (/([ap])\.?m?\.?$/i.exec(endRaw.trim())?.[1]?.toLowerCase() as "a" | "p" | undefined) : undefined;
  const value = parseSingle(startRaw, endMeridiem ?? null);

  if (!value) {
    return {
      value: null,
      error: `Time onsite "${text}" isn't a time I can save — use something like 2pm, 2:30pm or 14:30 (for a window, give the start time).`,
    };
  }
  return { value, error: null };
}

/** "14:00:00" (as Postgres returns it) -> "14:00" for display and editing. */
export function formatTimeOnsite(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  return m ? `${m[1]}:${m[2]}` : value;
}
