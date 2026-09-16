/** Ledger money-out is positive. Bank CSV uses debit / credit columns. */

export type BankDirectionLabel = "debit" | "credit";

export function inferredBankDirection(
  amount: number,
): BankDirectionLabel | null {
  if (amount > 0) return "debit";
  if (amount < 0) return "credit";
  return null;
}

/** Prefer explicit bankDirection; else infer from signed ledger amount. */
export function resolveBankDirection(txn: {
  amount: number;
  bankDirection?: string | null;
}): BankDirectionLabel | null {
  const labeled = String(txn.bankDirection ?? "").toLowerCase();
  if (labeled === "credit" || labeled === "debit") return labeled;
  return inferredBankDirection(txn.amount);
}

export function ledgerDebitCredit(txn: {
  amount: number;
  bankDirection?: string | null;
}): { debit: number | null; credit: number | null } {
  const abs = Math.abs(txn.amount);
  if (abs === 0) return { debit: null, credit: null };

  const dir = String(txn.bankDirection ?? "").toLowerCase();
  if (dir === "debit") return { debit: abs, credit: null };
  if (dir === "credit") return { debit: null, credit: abs };

  const inferred = inferredBankDirection(txn.amount);
  if (dir === "" && inferred === "debit") return { debit: abs, credit: null };
  if (dir === "" && inferred === "credit") return { debit: null, credit: abs };

  return { debit: null, credit: null };
}

export function historyMatchLabel(
  value: string | null | undefined,
): "matched" | "unmatched" | null {
  if (value === "matched" || value === "unmatched") return value;
  return null;
}
