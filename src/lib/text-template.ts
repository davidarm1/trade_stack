export type TemplateValue = string | number | null | undefined;

export type TemplateValues = Record<string, TemplateValue>;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

export function renderTemplateText(template: string, values: TemplateValues): string {
  const source = String(template ?? "");
  if (!source.trim()) return "";

  return source
    .split(/\r?\n/)
    .map((line) => {
      const segments = line
        .split("|")
        .map((segment) => {
          let sawToken = false;
          let sawValue = false;
          const rendered = segment
            .replace(/##([a-z0-9_]+)##|\{\{([a-z0-9_]+)\}\}/gi, (_, hashKey, braceKey) => {
              sawToken = true;
              const key = normalizeKey(String(hashKey ?? braceKey ?? ""));
              const value = values[key];
              if (value == null) return "";
              const text = String(value).trim();
              if (!text) return "";
              sawValue = true;
              return text;
            })
            .trim()
            .replace(/\s{2,}/g, " ");

          if (!rendered) return null;
          if (sawToken && !sawValue) return null;
          return rendered;
        })
        .filter(Boolean) as string[];

      return segments.join(" | ").trim();
    })
    .filter(Boolean)
    .join("\n");
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
