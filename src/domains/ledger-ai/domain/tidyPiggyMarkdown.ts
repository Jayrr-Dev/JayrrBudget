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
  return text
    .split("\n")
    .map((line) => pipesToTable(line) ?? line)
    .join("\n");
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
