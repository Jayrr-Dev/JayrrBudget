/**
 * Split ledger rows into real cash flow vs money that only moved
 * between owned accounts. Both sides of a card payoff exist in the
 * books (chequing out + visa in). Only the paying side is volume.
 */

import { canonicalCategoryName } from "./canonicalCategories";

export type CashFlowKind =
  | "spend"
  | "income"
  | "transfer_out"
  | "transfer_in"
  | "refund";

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
  return /e-?transfer/i.test(description) && !/^internet\s+transfer\b/i.test(description);
}

function looksLikeRemittance(signals: CashFlowSignals) {
  const description = signals.description ?? "";
  const type = norm(signals.typeName);
  const category = norm(signals.categoryName);
  return (
    /global\s+money\s+transfer/i.test(description) ||
    type === "remittances" ||
    type === "international remittance" ||
    type === "international transfers" ||
    type === "wire transfer" ||
    category === "remittance" ||
    category === "external transfers"
  );
}

function looksLikePlainInternetTransfer(description: string) {
  return /^internet\s+transfer\b/i.test(description);
}

function isCreditAccount(accountType: string | null) {
  const type = norm(accountType);
  return type === "credit" || type === "loan";
}

const INTERNAL_TRANSFER_TYPES = new Set([
  "credit card payment",
  "credit card payoffs",
  "self transfers",
  "internal transfers",
  "internal transfer",
  "investment transfer",
]);

const INTERNAL_TRANSFER_DETAILED = new Set([
  "credit card payment",
  "credit card payoffs",
  "self transfers",
  "internal transfers",
  "internal transfer",
  "investment transfer",
]);

function isIncomeBucket(signals: CashFlowSignals) {
  const section = norm(signals.sectionName);
  const primary = norm(signals.categoryPrimary);
  const category = norm(signals.categoryName);
  return (
    section === "income" ||
    primary === "income" ||
    /employment|government.*tax|cashback|rebate|salary|wage|payroll|paycheck|tax refund|tax credit|gst|hst/i.test(
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
  if (looksLikeRemittance(signals) && category !== "account transfers") {
    return false;
  }
  if (category === "external transfers" || category === "money transfers") {
    return false;
  }

  if (
    isCreditAccount(signals.accountType) &&
    signals.amountMinor < 0 &&
    (looksLikeCardPayment(description) ||
      norm(signals.transactionCode) === "payment" ||
      INTERNAL_TRANSFER_DETAILED.has(detailed))
  ) {
    return true;
  }

  if (looksLikeCardPayment(description)) return true;
  if (INTERNAL_TRANSFER_DETAILED.has(detailed)) return true;
  if (INTERNAL_TRANSFER_TYPES.has(type)) return true;
  if (looksLikePlainInternetTransfer(description)) return true;
  if (category === "investments" && type === "investment transfer") return true;
  if (category === "account transfers") return true;
  if (
    primary === "transfer" &&
    detailed === "transfer" &&
    category !== "external transfers"
  ) {
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

/** Chart label for real spend. Prefer live taxonomy category labels. */
export function spendCategoryLabel(
  signals: CashFlowSignals,
  fallback: string,
) {
  if (signals.categoryName?.trim()) {
    return signals.categoryName.trim();
  }
  return canonicalCategoryName(
    fallback,
    signals.typeName ?? signals.categoryDetailed,
  );
}
