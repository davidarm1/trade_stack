/** Split a comma/semicolon/newline separated list into unique, validated emails. */
export function parseInvoiceRecipients(
  raw: string | null | undefined,
): { recipients: string[]; error: string | null } {
  const text = String(raw ?? "").trim();
  const recipients = Array.from(
    new Set(
      text
        .split(/[,\n;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (recipients.length === 0) {
    return { recipients: [], error: "At least one recipient email is required." };
  }
  const bad = recipients.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(e));
  if (bad) return { recipients: [], error: `Invalid email address: ${bad}` };
  return { recipients, error: null };
}
