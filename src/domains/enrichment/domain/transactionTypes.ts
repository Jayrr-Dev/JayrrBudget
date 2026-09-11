import type { CashFlowKind } from "@/domains/analysis/domain/cashFlow";

/** Cash-flow labels on transaction_labels.role = "transaction_type". */
export const TRANSACTION_TYPE_NAMES = [
  "income",
  "transfers",
  "expenses",
] as const;

export type TransactionTypeName = (typeof TRANSACTION_TYPE_NAMES)[number];

/** Avoid slug collisions with spend-tree sections named Income / Transfers. */
export function transactionTypeSlug(name: TransactionTypeName) {
  return `txn-type-${name}`;
}

const TRANSACTION_TYPE_SET = new Set<string>(TRANSACTION_TYPE_NAMES);

export function isTransactionTypeName(
  name: string | null | undefined,
): name is TransactionTypeName {
  if (!name?.trim()) return false;
  return TRANSACTION_TYPE_SET.has(name.trim().toLowerCase());
}

export function transactionTypeFromCashFlowKind(
  kind: CashFlowKind,
): TransactionTypeName {
  if (kind === "income") return "income";
  if (kind === "transfer_out" || kind === "transfer_in") return "transfers";
  return "expenses";
}

export function formatTransactionTypeLabel(name: TransactionTypeName) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
