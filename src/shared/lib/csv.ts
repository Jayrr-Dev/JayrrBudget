/** Escape one CSV cell (RFC 4180). */
export function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return escapeCsvCell(value.join("; "));
  }
  const str =
    typeof value === "boolean"
      ? value
        ? "true"
        : "false"
      : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build CSV text from headers + row values. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** Trigger browser download of a CSV file (UTF-8 BOM for Excel). */
export function downloadCsv(filename: string, csv: string) {
  const name = filename.toLowerCase().endsWith(".csv")
    ? filename
    : `${filename}.csv`;
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
