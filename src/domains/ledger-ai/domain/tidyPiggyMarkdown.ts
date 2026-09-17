/**
 * Repair common Piggy / LLM markdown so GFM can parse it.
 * Handles glued bold (`**Label:****$5`) and one-line `A | B` "tables".
 */
export function tidyPiggyMarkdown(source: string): string {
  const chunks = source.split(/(```[\s\S]*?```)/g);
  return chunks
    .map((chunk, index) => (index % 2 === 1 ? chunk : tidyProse(chunk)))
    .join("");
}

function tidyProse(source: string): string {
  let text = source.replace(/\*{4,}/g, "**");
  text = text.replace(/\*\*([^*\n]+?):\*\*\s*/g, "**$1:** ");
  text = rewriteLocalImages(text);
  return text
    .split("\n")
    .map((line) => pipesToTable(line) ?? line)
    .join("\n");
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** `![Board title](not-a-url)` is a fake embed; keep the title as a markdown link. */
function rewriteLocalImages(source: string) {
  return source.replace(
    /!\[([^\]]*)\]\(([^)]*)\)/g,
    (_match, alt: string, src: string) => {
      const label = alt.trim();
      const href = src.trim().replace(/^<|>$/g, "");
      if (isHttpUrl(href)) return _match;
      if (!label) return "";
      return `[${label}](${label})`;
    },
  );
}

function pipesToTable(line: string): string | null {
  if (!line.includes(" | ") || /^\s*\|/.test(line)) return null;
  const cells = line
    .split(/\s*\|\s*/)
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length < 2) return null;
  const rows = cells.map((cell) => {
    const match =
      cell.match(/^\*\*(.+?):\*\*\s*(.*)$/) ??
      cell.match(/^\*\*(.+?):\*\s*(.*)$/) ??
      cell.match(/^(.+?):\s+(\S.*)$/);
    if (!match) return null;
    return {
      key: match[1].replace(/\*/g, "").trim(),
      value: match[2].trim(),
    };
  });
  if (rows.some((row) => row == null || !row.value)) return null;
  const keys = rows.map((row) => row!.key);
  const values = rows.map((row) => row!.value);
  return [
    `| ${keys.join(" | ")} |`,
    `| ${keys.map(() => "---").join(" | ")} |`,
    `| ${values.join(" | ")} |`,
  ].join("\n");
}
