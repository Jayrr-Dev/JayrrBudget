import {
  CIBC_CAR_LOAN_MERCHANT,
  CIBC_CAR_LOAN_TERMS,
} from "@/domains/loans/domain/carLoanConstants";
import type { MatchedPad } from "@/domains/loans/domain/amortize";

export type PadCandidateRow = {
  transactionId: string;
  posted: string;
  amount: number;
  merchantClean: string | null;
  description: string;
};

/** True when a ledger row looks like the biweekly car-loan PAD. */
export function isCarLoanPadCandidate(row: {
  amount: number;
  merchantClean: string | null;
  description: string;
  matchAmount?: number;
}): boolean {
  const matchAmount = row.matchAmount ?? CIBC_CAR_LOAN_TERMS.matchAmount;
  if (Math.abs(Math.abs(row.amount) - matchAmount) > 0.02) return false;

  const merchant = (row.merchantClean ?? "").trim().toLowerCase();
  if (
    merchant === CIBC_CAR_LOAN_MERCHANT.toLowerCase() ||
    merchant === "cibc loans" ||
    merchant === "cibc car loan"
  ) {
    return true;
  }

  const desc = row.description.toLowerCase();
  if (
    /preauthorized\s+debit\s+loan/i.test(desc) ||
    /pre-?authorized\s+debit.*loan/i.test(desc) ||
    (/loan/.test(desc) && /cibc/.test(desc))
  ) {
    return true;
  }

  return false;
}

export function toMatchedPads(rows: PadCandidateRow[]): MatchedPad[] {
  return rows
    .filter(isCarLoanPadCandidate)
    .map((row) => ({
      transactionId: row.transactionId,
      postedDate: row.posted.slice(0, 10),
      amount: Math.abs(row.amount),
    }))
    .sort((a, b) => a.postedDate.localeCompare(b.postedDate));
}
