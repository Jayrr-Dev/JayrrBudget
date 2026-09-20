import { normalizeCurrencyCode } from "@/shared/lib/currency";

export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

const DATE_ALIASES = [
  "date",
  "posted",
  "transactiondate",
  "posteddate",
  "transdate",
  "trxdate",
  "valuedate",
  "bookingdate",
  "dtposted",
];
const DESCRIPTION_ALIASES = [
  "description",
  "name",
  "merchant",
  "transactiondescription",
  "details",
  "memo",
  "payee",
  "narrative",
  "particular",
  "particulars",
  "transactiondetails",
];
const AMOUNT_ALIASES = [
  "amount",
  "transactionamount",
  "cad",
  "usd",
  "value",
  "amt",
  "cadamount",
  "amountcad",
];
const DEBIT_ALIASES = [
  "debit",
  "withdrawal",
  "outflow",
  "moneyout",
  "spent",
  "charge",
];
const CREDIT_ALIASES = [
  "credit",
  "deposit",
  "inflow",
  "moneyin",
  "received",
];
const CURRENCY_ALIASES = ["currency", "currencycode", "isocurrencycode"];

export type CsvColumnMap = {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  currency: number;
};

export type LedgerCsvRow = {
  date: string;
  description: string;
  amount: number;
  currency: string;
};

export function normalizeCsvHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z]/g, "");
}

export function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
      continue;
    }
    value += char;
  }
  values.push(value.trim());
  return values;
}

export function coerceCsvDelimiter(
  value: string | null | undefined,
): CsvDelimiter | null {
  if (value === "," || value === ";" || value === "|" || value === "\t") {
    return value;
  }
  if (value === "tab" || value === "\\t") return "\t";
  return null;
}

export function sniffCsvDelimiter(lines: string[]): CsvDelimiter {
  let best: CsvDelimiter = ",";
  let bestScore = -1;
  for (const delimiter of CSV_DELIMITERS) {
    let score = 0;
    for (const line of lines.slice(0, 8)) {
      const cells = parseCsvLine(line, delimiter);
      if (cells.length > 1) score += cells.length;
    }
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

export function parseMoneyAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parenNegative = /^\(.*\)$/.test(trimmed);
  let text = trimmed.replace(/[()\s]/g, "").replace(/[$£€¥]/g, "");
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  if (parenNegative) return -Math.abs(parsed);
  return parsed;
}

function indexOfAlias(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

export function mapCsvColumns(headers: string[]): CsvColumnMap | null {
  const date = indexOfAlias(headers, DATE_ALIASES);
  const description = indexOfAlias(headers, DESCRIPTION_ALIASES);
  const amount = indexOfAlias(headers, AMOUNT_ALIASES);
  const debit = indexOfAlias(headers, DEBIT_ALIASES);
  const credit = indexOfAlias(headers, CREDIT_ALIASES);
  const currency = indexOfAlias(headers, CURRENCY_ALIASES);
  if (date < 0 || description < 0) return null;
  if (amount < 0 && debit < 0 && credit < 0) return null;
  return { date, description, amount, debit, credit, currency };
}

export function splitCsvLines(text: string) {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/);
}

export function findCsvHeaderRow(
  lines: string[],
  delimiter: string,
): { headerIndex: number; columns: CsvColumnMap } | null {
  const limit = Math.min(lines.length, 40);
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index];
    if (!line?.trim()) continue;
    const columns = mapCsvColumns(
      parseCsvLine(line, delimiter).map(normalizeCsvHeader),
    );
    if (columns) return { headerIndex: index, columns };
  }
  return null;
}

export function rowsFromCsvTable(input: {
  lines: string[];
  delimiter: string;
  headerIndex: number;
  columns: CsvColumnMap;
}): LedgerCsvRow[] {
  const rows: LedgerCsvRow[] = [];
  for (let rowIndex = input.headerIndex + 1; rowIndex < input.lines.length; rowIndex += 1) {
    const line = input.lines[rowIndex];
    if (!line?.trim()) continue;
    const row = parseCsvLine(line, input.delimiter);
    const date = row[input.columns.date]?.trim() ?? "";
    const description = row[input.columns.description]?.trim() ?? "";
    const amountRaw =
      input.columns.amount >= 0
        ? row[input.columns.amount]
        : row[input.columns.debit] || row[input.columns.credit];
    const parsedAmount = parseMoneyAmount(amountRaw);
    if (!date || !description || parsedAmount == null) continue;
    const signedAmount =
      input.columns.amount >= 0
        ? parsedAmount
        : input.columns.debit >= 0 && row[input.columns.debit]
          ? Math.abs(parsedAmount)
          : -Math.abs(parsedAmount);
    const currencyRaw =
      input.columns.currency >= 0 ? row[input.columns.currency] : undefined;
    rows.push({
      date,
      description,
      amount: signedAmount,
      currency: normalizeCurrencyCode(currencyRaw),
    });
  }
  return rows;
}

export function parseLedgerCsvText(text: string): LedgerCsvRow[] {
  const lines = splitCsvLines(text);
  const filled = lines.filter((line) => line.trim());
  if (filled.length < 2) return [];
  const delimiter = sniffCsvDelimiter(filled);
  const header = findCsvHeaderRow(lines, delimiter);
  if (!header) return [];
  return rowsFromCsvTable({
    lines,
    delimiter,
    headerIndex: header.headerIndex,
    columns: header.columns,
  });
}
