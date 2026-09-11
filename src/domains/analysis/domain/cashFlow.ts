/**
 * Split ledger rows into real cash flow vs money that only moved
 * between owned accounts. Both sides of a card payoff exist in the
 * books (chequing out + visa in). Only the paying side is volume.
 */

export type CashFlowKind = "spend" | "income" | "transfer_out" | "transfer_in" | "refund";

export type CashFlowSignals = {
  amountMinor: number;
  description: string | null;
  accountType: string | null;
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  sectionName: string | null;
  categoryName: string | null;
  typeName: string | null;
  transactionCode: string | null;
};

function norm(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function looksLikeCardPayment(description: string) {
  return (
    /payment\s*thank\s*you/i.test(description) ||
    /paiement\s*merci/i.test(description) ||
    /pad\s+payment.{0,40}card/i.test(description) ||
    /internet\s+bill\s*pay.{0,40}card/i.test(description) ||
    /internet\s+transfer.{0,80}to\s+card/i.test(description) ||
    /cibc\s+card\s+payment/i.test(description)
  );
}

function looksLikeNamedEtransfer(description: string) {
  return /e-?transfer/i.test(description);
}

function looksLikeRemittance(signals: CashFlowSignals) {
  const description = signals.description ?? "";
  const type = norm(signals.typeName);
  const category = norm(signals.categoryName);
  return (
    /global\s+money\s+transfer/i.test(description) ||
    /international\s+remittance/i.test(type) ||
    /international\s+transfers/i.test(type) ||
    category === "remittance" ||
    type === "p2p transfers"
  );
}

function looksLikePlainInternetTransfer(description: string) {
  return /^internet\s+transfer\b/i.test(description);
}

function isCreditAccount(accountType: string | null) {
  const type = norm(accountType);
  return type === "credit" || type === "loan";
}

function isIncomeBucket(signals: CashFlowSignals) {
  const section = norm(signals.sectionName);
  const primary = norm(signals.categoryPrimary);
  const category = norm(signals.categoryName);
  return (
    section === "income" ||
    primary === "income" ||
    /salary|wage|employment|payroll|cashback|reward|rebate|tax refund|tax benefit/i.test(
      category,
    )
  );
}

function isRefundRow(signals: CashFlowSignals) {
  const code = norm(signals.transactionCode);
  const description = signals.description ?? "";
  if (isIncomeBucket(signals)) return false;
  if (code === "refund") return true;
  if (/^credit\s+(adjustment|toronto)/i.test(description)) return true;
  return false;
}

function isInternalMove(signals: CashFlowSignals) {
  const description = signals.description ?? "";
  const category = norm(signals.categoryName);
  const detailed = norm(signals.categoryDetailed);
  const type = norm(signals.typeName);
  const primary = norm(signals.categoryPrimary);

  if (looksLikeNamedEtransfer(description) && !looksLikeCardPayment(description)) {
    return false;
  }
  if (looksLikeRemittance(signals)) return false;

  if (
    isCreditAccount(signals.accountType) &&
    signals.amountMinor < 0 &&
    (looksLikeCardPayment(description) ||
      norm(signals.transactionCode) === "payment" ||
      detailed === "credit card payment")
  ) {
    return true;
  }

  if (looksLikeCardPayment(description)) return true;
  if (detailed === "credit card payment") return true;
  if (type === "credit card payment") return true;
  if (looksLikePlainInternetTransfer(description)) return true;
  if (type === "internal transfers") return true;
  if (category === "investments") return true;
  if (category === "account transfers") return true;
  if (primary === "transfer" && detailed === "transfer" && !looksLikeRemittance(signals)) {
    return true;
  }
  return false;
}

export function classifyCashFlow(signals: CashFlowSignals): CashFlowKind {
  if (isRefundRow(signals) && signals.amountMinor < 0) return "refund";

  if (isInternalMove(signals)) {
    if (signals.amountMinor < 0) return "transfer_in";
    return "transfer_out";
  }

  if (isIncomeBucket(signals) && signals.amountMinor < 0) return "income";

  if (signals.amountMinor < 0) {
    if (looksLikeNamedEtransfer(signals.description ?? "")) return "income";
    return "refund";
  }

  return "spend";
}

import { canonicalCategoryName } from "@/domains/enrichment/domain/canonicalCategories";

/** Chart label for real spend. Keep remittances out of "Account Transfers". */
export function spendCategoryLabel(
  signals: CashFlowSignals,
  fallback: string,
) {
  const hint = signals.typeName ?? signals.categoryDetailed;
  if (looksLikeRemittance(signals)) {
    return canonicalCategoryName("Remittance", hint);
  }
  if (looksLikeNamedEtransfer(signals.description ?? "")) {
    return canonicalCategoryName("Money Transfers", hint);
  }
  return canonicalCategoryName(fallback, hint);
}
