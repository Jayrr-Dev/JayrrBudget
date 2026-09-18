/**
 * Money color follows the effect on the user's equity, not the raw sign.
 *
 *   gain    = equity up   (income, refund, cash sitting in an asset account)
 *   cost    = equity down (spend, interest, debt still owed)
 *   neutral = equity flat (money moved between the user's own accounts)
 *
 * Account class decides how a balance reads:
 *   asset     (chequing, savings, investment)  positive = gain, overdrawn = cost
 *   liability (credit card, loan, LOC)          positive owed = cost, credit = gain
 *
 * Ledger sign: positive amount = money out of the account.
 */

import {
  classifyCashFlow,
  type CashFlowKind,
} from "@/domains/analysis/domain/cashFlow";
import { resolveAccountCategory } from "@/domains/dashboard/domain/accountCategory";
import { resolveBankDirection } from "@/domains/transactions/domain/debitCredit";

export type AccountClass = "asset" | "liability";

export type MoneyTone = "gain" | "cost" | "neutral";

const LIABILITY_TYPES = new Set(["credit", "loan", "mortgage"]);

export function accountClassFor(account: {
  name: string;
  officialName?: string | null;
  type?: string | null;
  subtype?: string | null;
}): AccountClass {
  const category = resolveAccountCategory(account);
  return category === "credit_card" || category === "lending"
    ? "liability"
    : "asset";
}

/** When only the stored ledger type is known (no name/subtype). */
export function accountClassFromType(
  type: string | null | undefined,
): AccountClass {
  return LIABILITY_TYPES.has((type ?? "").trim().toLowerCase())
    ? "liability"
    : "asset";
}

/** Balance as stored: liabilities keep the owed amount positive. */
export function balanceTone(
  balance: number | null | undefined,
  accountClass: AccountClass,
): MoneyTone {
  if (balance == null || Number.isNaN(balance) || Math.abs(balance) < 0.005) {
    return "neutral";
  }
  if (accountClass === "asset") return balance > 0 ? "gain" : "cost";
  return balance > 0 ? "cost" : "gain";
}

export function cashFlowTone(kind: CashFlowKind): MoneyTone {
  switch (kind) {
    case "income":
    case "refund":
      return "gain";
    case "spend":
      return "cost";
    case "transfer_in":
    case "transfer_out":
      return "neutral";
  }
}

/** Fallback when only the ledger sign is known: money in = gain, money out = cost. */
export function signTone(amount: number | null | undefined): MoneyTone {
  if (amount == null || Number.isNaN(amount)) return "neutral";
  if (amount < 0) return "gain";
  if (amount > 0) return "cost";
  return "neutral";
}

export type TransactionToneInput = {
  amount: number;
  bankDirection?: string | null;
  name?: string | null;
  originalDescription?: string | null;
  sectionName?: string | null;
  categoryName?: string | null;
  typeName?: string | null;
  transactionTypeName?: string | null;
  transactionCode?: string | null;
};

/**
 * Row color for a ledger line. Uses the cash-flow classifier so a card
 * payoff or internet transfer reads neutral instead of income/spend.
 */
export function transactionTone(
  txn: TransactionToneInput,
  accountType: string | null | undefined,
): MoneyTone {
  const direction = resolveBankDirection(txn);
  const magnitude = Math.abs(txn.amount);
  const signed =
    direction === "credit"
      ? -magnitude
      : direction === "debit"
        ? magnitude
        : txn.amount;
  if (Math.abs(signed) < 0.005) return "neutral";

  const kind = classifyCashFlow({
    amountMinor: Math.round(signed * 100),
    description: txn.originalDescription ?? txn.name ?? null,
    accountType: accountType ?? null,
    sectionName: txn.sectionName ?? null,
    categoryName: txn.categoryName ?? null,
    typeName: txn.transactionTypeName ?? txn.typeName ?? null,
    transactionCode: txn.transactionCode ?? null,
  });
  return cashFlowTone(kind);
}
