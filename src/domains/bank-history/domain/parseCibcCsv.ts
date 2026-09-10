import { createHash } from "node:crypto";
import { normalizeStatementText } from "@/domains/statements/domain/parsedStatement";

export type BankHistoryAccountType = "chequing" | "credit" | "lending";
export type BankDirection = "debit" | "credit";

export type ParsedBankHistoryRow = {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  direction: BankDirection;
  amount: number;
  cardNumber: string | null;
  accountMask: string;
  accountType: BankHistoryAccountType;
  fingerprint: string;
};

export type AccountHint = {
  mask: string;
  accountType: BankHistoryAccountType;
  productName: string;
  /** From the CSV filename when the file has no card column. */
  cardNumber: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseMoney(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value === 0) return null;
  return round2(Math.abs(value));
}

export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

function digitsFromFilename(filename: string): string | null {
  const match = filename.match(/(\d{4,})/);
  return match?.[1] ?? null;
}

export function accountHintFromFilename(
  filename: string,
): AccountHint | null {
  const name = filename.toLowerCase();
  const digits = digitsFromFilename(filename);
  if (/\bvisa\b/.test(name) && /1654/.test(name)) {
    return {
      mask: "1654",
      accountType: "credit",
      productName: "Visa 1654",
      cardNumber: digits ?? "1654",
    };
  }
  if (/\bvisa\b/.test(name) && /9047/.test(name)) {
    return {
      mask: "9047",
      accountType: "credit",
      productName: "Visa 9047",
      cardNumber: digits ?? "9047",
    };
  }
  if (/mastercard|master\s*card/.test(name)) {
    const mask = digits?.slice(-4) ?? "9559";
    return {
      mask,
      accountType: "credit",
      productName: `Mastercard ${mask}`,
      cardNumber: digits ?? mask,
    };
  }
  if (/\bloc\b/.test(name)) {
    const locDigits = digits ?? "52839";
    return {
      mask: locDigits.slice(-4),
      accountType: "lending",
      productName: `LOC ${locDigits}`,
      cardNumber: locDigits,
    };
  }
  if (/cibc|chequ/.test(name)) {
    return {
      mask: "5192",
      accountType: "chequing",
      productName: "CIBC Chequing",
      cardNumber: digits ?? "5192",
    };
  }
  return null;
}

function maskFromCard(cardNumber: string | null, fallback: string): string {
  if (!cardNumber) return fallback;
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return fallback;
}

function fingerprintFor(
  row: Omit<ParsedBankHistoryRow, "fingerprint">,
  occurrence: number,
) {
  return createHash("sha256")
    .update(
      [
        row.accountMask,
        row.date,
        normalizeStatementText(row.description),
        row.debit ?? "",
        row.credit ?? "",
        occurrence,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}

export function parseCibcHistoryCsv(
  text: string,
  hint: AccountHint,
): ParsedBankHistoryRow[] {
  const occurrence = new Map<string, number>();
  const rows: ParsedBankHistoryRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = splitCsvLine(line);
    if (fields.length < 3) continue;
    const date = fields[0];
    if (!ISO_DATE.test(date)) continue;

    const description = fields[1] ?? "";
    if (!description) continue;

    const debit = parseMoney(fields[2]);
    const credit = parseMoney(fields[3]);
    const maybeCard =
      fields.length >= 5 && /[0-9*]{8,}/.test(fields[4] ?? "")
        ? fields[4]
        : null;

    if (debit == null && credit == null) continue;

    const direction: BankDirection = debit != null && credit == null
      ? "debit"
      : credit != null && debit == null
        ? "credit"
        : debit != null && (credit == null || debit >= (credit ?? 0))
          ? "debit"
          : "credit";

    const amount =
      direction === "debit" ? (debit ?? 0) : -1 * (credit ?? 0);

    const accountMask = maskFromCard(maybeCard, hint.mask);
    const base: Omit<ParsedBankHistoryRow, "fingerprint"> = {
      date,
      description,
      debit,
      credit,
      direction,
      amount: round2(amount),
      cardNumber: maybeCard ?? hint.cardNumber,
      accountMask,
      accountType: hint.accountType,
    };
    const occKey = `${accountMask}|${date}|${normalizeStatementText(description)}|${debit}|${credit}`;
    const next = (occurrence.get(occKey) ?? 0) + 1;
    occurrence.set(occKey, next);

    rows.push({
      ...base,
      fingerprint: fingerprintFor(base, next),
    });
  }

  return rows;
}
