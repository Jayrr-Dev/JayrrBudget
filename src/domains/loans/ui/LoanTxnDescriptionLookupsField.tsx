"use client";

import { TxnDescriptionLookupCombobox } from "@/domains/loans/ui/TxnDescriptionLookupCombobox";
import {
  saveEncryptedLoan,
  vaultWriteReady,
} from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { toastIfOffline } from "@/shared/offline/offlineWriteGuard";
import { useConvex } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  accountId: string;
};

export function LoanTxnDescriptionLookupsField({ accountId }: Props) {
  const client = useConvex();
  const privateLedger = usePrivateLedger();
  const [busy, setBusy] = useState(false);

  const loan = privateLedger.ledger.loans.find(
    (row) => row.accountId === accountId,
  );
  const write = vaultWriteReady({
    userId: privateLedger.userId,
    vaultId: privateLedger.vaultId,
    keyId: privateLedger.keyId,
    client,
  });

  const value =
    loan?.txnDescriptionLookup?.trim() ||
    loan?.matchMerchantClean?.trim() ||
    "";

  async function saveLookups(next: string) {
    if (!loan || !write) {
      toast.error("Unlock the vault to edit lookups.");
      return;
    }
    if (toastIfOffline()) return;
    if (privateLedger.loading) {
      toast.error("Wait for the vault to finish unlocking.");
      return;
    }
    if (next === value) return;
    setBusy(true);
    try {
      await saveEncryptedLoan(write, {
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
        matchMerchantClean: next || null,
        txnDescriptionLookup: next || null,
        matchAmount: loan.matchAmount ?? null,
        confirmedPaymentNumbers: loan.confirmedPaymentNumbers ?? [],
        skippedPaymentNumbers: loan.skippedPaymentNumbers ?? [],
        expectedRevision: loan.revision,
      });
      privateLedger.applyLedger({
        ...privateLedger.ledger,
        loans: privateLedger.ledger.loans.map((row) =>
          row.accountId === accountId
            ? {
                ...row,
                matchMerchantClean: next || null,
                txnDescriptionLookup: next || null,
                revision: loan.revision + 1,
              }
            : row,
        ),
      });
      privateLedger.reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save lookups",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <TxnDescriptionLookupCombobox
      id={`loan-${accountId}-txn-lookups`}
      value={value}
      transactions={privateLedger.ledger.transactions}
      onChange={(next) => {
        void saveLookups(next);
      }}
      placeholder="Search and add transactions…"
      disabled={busy || !write || !loan}
    />
  );
}
