import type { MatchedPad } from "./amortize";

export type PadCandidateRow = {
  transactionId: string;
  posted: string;
  amount: number;
  merchantClean: string | null;
  description: string;
};

function merchantAliases(matchMerchantClean: string): Set<string> {
  const needle = matchMerchantClean.trim().toLowerCase();
  const aliases = new Set<string>([needle]);
  // Legacy CIBC statement labels for the seeded car loan.
  if (needle.includes("cibc") && needle.includes("loan")) {
    aliases.add("cibc loans");
    aliases.add("cibc car loan");
  }
  return aliases;
}

/** True when a ledger row matches this loan's PAD amount + merchant. */
export function isLoanPadCandidate(
  row: {
    amount: number;
    merchantClean: string | null;
    description: string;
  },
  matchAmount: number,
  matchMerchantClean: string,
): boolean {
  if (Math.abs(Math.abs(row.amount) - matchAmount) > 0.02) return false;

  const aliases = merchantAliases(matchMerchantClean);
  if (aliases.size === 0 || [...aliases].every((a) => !a)) return false;

  const merchant = (row.merchantClean ?? "").trim().toLowerCase();
  if (merchant && [...aliases].some((a) => a && (merchant === a || merchant.includes(a)))) {
    return true;
  }

  const desc = row.description.toLowerCase();
  if ([...aliases].some((a) => a && desc.includes(a))) {
    return true;
  }

  // Loose PAD wording only when description also mentions the terms merchant.
  const needle = matchMerchantClean.trim().toLowerCase();
  const firstToken = needle.split(/\s+/).find((t) => t.length >= 3);
  if (
    firstToken &&
    desc.includes(firstToken) &&
    (/preauthorized\s+debit/i.test(desc) ||
      /pre-?authorized\s+debit/i.test(desc) ||
      /loan/i.test(desc))
  ) {
    return true;
  }

  return false;
}

/** @deprecated Prefer isLoanPadCandidate with explicit terms. */
export function isCarLoanPadCandidate(row: {
  amount: number;
  merchantClean: string | null;
  description: string;
  matchAmount?: number;
  matchMerchantClean?: string;
}): boolean {
  if (row.matchAmount == null || !row.matchMerchantClean) return false;
  return isLoanPadCandidate(row, row.matchAmount, row.matchMerchantClean);
}

export function toMatchedPads(
  rows: PadCandidateRow[],
  matchAmount: number,
  matchMerchantClean: string,
): MatchedPad[] {
  return rows
    .filter((row) => isLoanPadCandidate(row, matchAmount, matchMerchantClean))
    .map((row) => ({
      transactionId: row.transactionId,
      postedDate: row.posted.slice(0, 10),
      amount: Math.abs(row.amount),
    }))
    .sort((a, b) => a.postedDate.localeCompare(b.postedDate));
}
