export type TemplateValue = string | number | null | undefined;

export type TemplateValues = Record<string, TemplateValue>;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

export function renderTemplateText(template: string, values: TemplateValues): string {
  const source = String(template ?? "");
  if (!source.trim()) return "";

  return source.replace(/##([a-z0-9_]+)##|\{\{([a-z0-9_]+)\}\}/gi, (_, hashKey, braceKey) => {
    const key = normalizeKey(String(hashKey ?? braceKey ?? ""));
    const value = values[key];
    return value == null ? "" : String(value);
  });
}

export function compactTemplateBlock(lines: Array<TemplateValue>): string {
  return lines
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .join(" | ");
}

export function multilineTemplateBlock(lines: Array<TemplateValue>): string {
  return lines
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .join("\n");
}
