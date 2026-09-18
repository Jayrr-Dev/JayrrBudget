import type { MatchedPad } from "./amortize";

export type PadCandidateRow = {
  transactionId: string;
  posted: string;
  amount: number;
  merchantClean: string | null;
  description: string;
};

function descriptionAliases(txnDescriptionLookup: string): string[] {
  const needle = txnDescriptionLookup.trim().toLowerCase();
  if (!needle) return [];
  const aliases = [needle];
  // Legacy CIBC statement labels for the seeded car loan.
  if (needle.includes("cibc") && needle.includes("loan")) {
    aliases.push("cibc loans", "cibc car loan");
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
