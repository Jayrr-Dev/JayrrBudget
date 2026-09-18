import type { PrivateLedger, PrivateLoanTerms } from "@/domains/vault/domain/privateLedger";
import {
  saveEncryptedLoan,
  type VaultWriteContext,
} from "@/domains/vault/application/saveEncryptedLedger";

export type LoanPaymentDecision = "confirm" | "remove";

function uniquePaymentNumbers(values: number[]) {
  return [...new Set(values.filter((n) => Number.isFinite(n) && n >= 1))].sort(
    (a, b) => a - b,
  );
}

function loanWriteFields(loan: PrivateLoanTerms) {
  return {
    accountId: loan.accountId,
    principal: loan.principal,
    annualRate: loan.annualRate,
    paymentAmount: loan.paymentAmount,
    firstPaymentDate: loan.firstPaymentDate,
    paymentCount: loan.paymentCount,
    paymentFrequency: loan.paymentFrequency ?? null,
    loanType: loan.loanType ?? null,
    rateType: loan.rateType ?? null,
    vehicleLabel: loan.vehicleLabel ?? null,
    matchMerchantClean: loan.matchMerchantClean ?? null,
    txnDescriptionLookup: loan.txnDescriptionLookup ?? null,
    matchAmount: loan.matchAmount ?? null,
    confirmedPaymentNumbers: loan.confirmedPaymentNumbers ?? [],
    skippedPaymentNumbers: loan.skippedPaymentNumbers ?? [],
  };
}

export function nextLoanPaymentDecision(
  loan: PrivateLoanTerms,
  paymentNumber: number,
  decision: LoanPaymentDecision,
): PrivateLoanTerms {
  const confirmed = new Set(loan.confirmedPaymentNumbers ?? []);
  const skipped = new Set(loan.skippedPaymentNumbers ?? []);
  if (decision === "confirm") {
    confirmed.add(paymentNumber);
    skipped.delete(paymentNumber);
  } else {
    skipped.add(paymentNumber);
    confirmed.delete(paymentNumber);
  }
  return {
    ...loan,
    confirmedPaymentNumbers: uniquePaymentNumbers([...confirmed]),
    skippedPaymentNumbers: uniquePaymentNumbers([...skipped]),
  };
}

export async function applyVaultLoanPaymentDecision(input: {
  ctx: VaultWriteContext;
  ledger: PrivateLedger;
  accountId: string;
  paymentNumber: number;
  decision: LoanPaymentDecision;
}): Promise<PrivateLedger> {
  const loan = input.ledger.loans.find(
    (row) => row.accountId === input.accountId,
  );
  if (!loan) {
    throw new Error("That lending account was not found.");
  }
  const nextLoan = nextLoanPaymentDecision(
    loan,
    input.paymentNumber,
    input.decision,
  );
  await saveEncryptedLoan(input.ctx, {
    ...loanWriteFields(nextLoan),
    expectedRevision: loan.revision,
  });
  return {
    ...input.ledger,
    loans: input.ledger.loans.map((row) =>
      row.accountId === input.accountId
        ? { ...nextLoan, revision: loan.revision + 1 }
        : row,
    ),
  };
}
