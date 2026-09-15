import { savePrivateRecords, type MutationClient, type PrivateRecordInput } from "@/crypto/vaultRecords";
import { normalizeCurrencyCode } from "@/shared/lib/currency";

function parseLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { values.push(value.trim()); value = ""; continue; }
    value += char;
  }
  values.push(value.trim());
  return values;
}

function indexOf(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

async function stableId(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function parsePrivateCsv(file: File): Promise<PrivateRecordInput[]> {
  const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("The CSV needs a header row and at least one transaction.");
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z]/g, ""));
  const date = indexOf(headers, ["date", "posted", "transactiondate", "posteddate"]);
  const description = indexOf(headers, ["description", "name", "merchant", "transactiondescription"]);
  const amount = indexOf(headers, ["amount", "transactionamount"]);
  const debit = indexOf(headers, ["debit", "withdrawal", "outflow"]);
  const credit = indexOf(headers, ["credit", "deposit", "inflow"]);
  const currency = indexOf(headers, ["currency", "currencycode", "isocurrencycode"]);
  if (date < 0 || description < 0 || (amount < 0 && debit < 0 && credit < 0)) throw new Error("CSV needs date, description, and amount columns.");
  const records: PrivateRecordInput[] = [];
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const row = parseLine(lines[rowIndex]);
    const rawAmount = amount >= 0 ? row[amount] : row[debit] || row[credit];
    const parsedAmount = Number(rawAmount?.replace(/[$£€¥,]/g, ""));
    if (!row[date] || !row[description] || !Number.isFinite(parsedAmount)) continue;
    const signedAmount = amount >= 0 ? parsedAmount : debit >= 0 && row[debit] ? Math.abs(parsedAmount) : -Math.abs(parsedAmount);
    const rowDate = row[date];
    const rowDescription = row[description];
    const rowCurrency = currency >= 0 ? normalizeCurrencyCode(row[currency]) : "CAD";
    const recordId = await stableId(`${rowDate}|${rowDescription}|${signedAmount}|${rowIndex}`);
    records.push({ recordId: `csv-${recordId}`, kind: "tx", value: { date: rowDate, description: rowDescription, amount: signedAmount, currency: rowCurrency }, expectedRevision: null });
  }
  if (!records.length) throw new Error("No readable transactions were found in the CSV.");
  return records;
}

export async function importPrivateCsv(client: MutationClient, input: { userId: string; vaultId: string; keyId: string; masterKey: CryptoKey; file: File }) {
  return savePrivateRecords(client, { ...input, records: await parsePrivateCsv(input.file) });
}
