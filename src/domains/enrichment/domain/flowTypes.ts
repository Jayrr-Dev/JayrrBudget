import {
  TRANSACTION_TYPE_NAMES,
  formatTransactionTypeLabel,
  isTransactionTypeName,
  transactionTypeFromCashFlowKind,
  type TransactionTypeName,
} from "@/domains/enrichment/domain/transactionTypes";

/** @deprecated Use TRANSACTION_TYPE_NAMES and role `transaction_type`. */
export const FLOW_TYPE_NAMES = TRANSACTION_TYPE_NAMES;

export type FlowTypeName = TransactionTypeName;

export function isFlowTypeName(name: string | null | undefined): name is FlowTypeName {
  return isTransactionTypeName(name);
}

export function flowTypeFromCashFlowKind(kind: Parameters<typeof transactionTypeFromCashFlowKind>[0]) {
  return transactionTypeFromCashFlowKind(kind);
}

export function pickPrimaryTypeName(typeNames: string[]): string | null {
  return typeNames[0] ?? null;
}

export { formatTransactionTypeLabel, isTransactionTypeName, transactionTypeFromCashFlowKind };
