import {
  savePrivateRecords,
  type MutationClient,
  type PrivateRecordInput,
} from "@/crypto/vaultRecords";
import { fetchNormalizedCsv } from "@/domains/vault/application/fetchNormalizedCsv";
import type { NormalizedCsv } from "@/domains/vault/domain/normalizedCsv";
import {
  coerceCsvDelimiter,
  parseLedgerCsvText,
  rowsFromCsvTable,
  sniffCsvDelimiter,
  splitCsvLines,
  type CsvColumnMap,
  type LedgerCsvRow,
} from "@/domains/vault/domain/parseLedgerCsv";
import { normalizeCurrencyCode } from "@/shared/lib/currency";

const MAX_CSV_BYTES = 2 * 1024 * 1024;

async function stableId(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function recordsFromLedgerRows(
  rows: LedgerCsvRow[],
): Promise<PrivateRecordInput[]> {
  const records: PrivateRecordInput[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;
    const recordId = await stableId(
      `${row.date}|${row.description}|${row.amount}|${rowIndex}`,
    );
    records.push({
      recordId: `csv-${recordId}`,
      kind: "tx",
      value: {
        date: row.date,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
      },
      expectedRevision: null,
    });
  }
  return records;
}

function rowsFromAiColumns(text: string, mapped: NormalizedCsv): LedgerCsvRow[] {
  if (
    mapped.headerRowIndex == null ||
    mapped.dateColumn == null ||
    mapped.descriptionColumn == null
  ) {
    return [];
  }
  const lines = splitCsvLines(text);
  const delimiter =
    coerceCsvDelimiter(mapped.delimiter) ??
    sniffCsvDelimiter(lines.filter((line) => line.trim()));
  const columns: CsvColumnMap = {
    date: mapped.dateColumn,
    description: mapped.descriptionColumn,
    amount: mapped.amountColumn ?? -1,
    debit: mapped.debitColumn ?? -1,
    credit: mapped.creditColumn ?? -1,
    currency: mapped.currencyColumn ?? -1,
  };
  if (columns.amount < 0 && columns.debit < 0 && columns.credit < 0) return [];
  return rowsFromCsvTable({
    lines,
    delimiter,
    headerIndex: mapped.headerRowIndex,
    columns,
  });
}

function rowsFromAiExtract(mapped: NormalizedCsv): LedgerCsvRow[] {
  return mapped.transactions
    .filter((row) => row.date.trim() && row.description.trim())
    .map((row) => ({
      date: row.date.trim(),
      description: row.description.trim(),
      amount: row.amount,
      currency: normalizeCurrencyCode(row.currency),
    }));
}

export async function parsePrivateCsv(file: File): Promise<PrivateRecordInput[]> {
  const text = await file.text();
  const records = await recordsFromLedgerRows(parseLedgerCsvText(text));
  if (!records.length) {
    throw new Error("CSV needs date, description, and amount columns.");
  }
  return records;
}

export type ImportPrivateCsvResult = {
  saved: number;
  usedAi: boolean;
};

export async function importPrivateCsv(
  client: MutationClient,
  input: {
    userId: string;
    vaultId: string;
    keyId: string;
    masterKey: CryptoKey;
    file: File;
    onAiStart?: () => void;
  },
): Promise<ImportPrivateCsvResult> {
  if (input.file.size > MAX_CSV_BYTES) {
    throw new Error("That CSV is larger than 2 MB.");
  }
  const text = await input.file.text();
  if (!text.trim()) throw new Error("That file is empty.");

  let usedAi = false;
  let rows = parseLedgerCsvText(text);
  if (!rows.length) {
    input.onAiStart?.();
    usedAi = true;
    const mapped = await fetchNormalizedCsv(text);
    rows =
      mapped.kind === "columns"
        ? rowsFromAiColumns(text, mapped)
        : rowsFromAiExtract(mapped);
    if (!rows.length && mapped.kind === "columns") {
      rows = rowsFromAiExtract(mapped);
    }
  }
  const records = await recordsFromLedgerRows(rows);
  if (!records.length) {
    throw new Error("No readable transactions were found in the CSV.");
  }
  const saved = await savePrivateRecords(client, { ...input, records });
  return { saved: saved.saved, usedAi };
}
