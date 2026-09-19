import type { MatchedPad } from "./amortize";

export type PadCandidateRow = {
  transactionId: string;
  posted: string;
  amount: number;
  merchantClean: string | null;
  description: string;
};

function parseTxnDescriptionLookups(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/\n+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function descriptionAliases(txnDescriptionLookup: string): string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const needle of parseTxnDescriptionLookups(txnDescriptionLookup).map(
    (part) => part.toLowerCase(),
  )) {
    if (!seen.has(needle)) {
      seen.add(needle);
      aliases.push(needle);
    }
    if (needle.includes("cibc") && needle.includes("loan")) {
      for (const extra of ["cibc loans", "cibc car loan"]) {
        if (seen.has(extra)) continue;
        seen.add(extra);
        aliases.push(extra);
      }
    }
  }
  return aliases;
}

/** True when a ledger row matches this loan's payment amount + description lookup. */
export function isLoanPadCandidate(
  row: {
    amount: number;
    description: string;
  },
  matchAmount: number,
  txnDescriptionLookup: string,
): boolean {
  if (Math.abs(Math.abs(row.amount) - matchAmount) > 0.02) return false;

  const aliases = descriptionAliases(txnDescriptionLookup);
  if (aliases.length === 0) return false;

  const desc = row.description.toLowerCase();
  return aliases.some((alias) => desc.includes(alias));
}

/** @deprecated Prefer isLoanPadCandidate with explicit terms. */
export function isCarLoanPadCandidate(row: {
  amount: number;
  description: string;
  matchAmount?: number;
  txnDescriptionLookup?: string;
  matchMerchantClean?: string;
}): boolean {
  const lookup = row.txnDescriptionLookup ?? row.matchMerchantClean;
  if (row.matchAmount == null || !lookup) return false;
  return isLoanPadCandidate(row, row.matchAmount, lookup);
}

export function toMatchedPads(
  rows: PadCandidateRow[],
  matchAmount: number,
  txnDescriptionLookup: string,
): MatchedPad[] {
  return rows
    .filter((row) => isLoanPadCandidate(row, matchAmount, txnDescriptionLookup))
    .map((row) => ({
      transactionId: row.transactionId,
      postedDate: row.posted.slice(0, 10),
      amount: Math.abs(row.amount),
    }))
    .sort((a, b) => a.postedDate.localeCompare(b.postedDate));
}
