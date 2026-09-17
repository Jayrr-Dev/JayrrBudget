"use client";

import { applyBudgetEdit } from "@/domains/ledger-ai/application/applyBudgetEdit";
import type {
  ApplyBudgetEditInput,
  ApplyBudgetEditOutput,
} from "@/domains/ledger-ai/domain/applyBudgetEditTool";
import { vaultWriteReady } from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import { useConvex } from "convex/react";
import { useEffect, useRef } from "react";

/** Runs one apply_budget_edit call in the browser, then tells Piggy the result. */
export function PiggyApplyBudgetEdit({
  input,
  pending,
  onDone,
}: {
  input: ApplyBudgetEditInput;
  pending: boolean;
  onDone: (output: ApplyBudgetEditOutput) => void;
}) {
  const privateLedger = usePrivateLedger();
  const convex = useConvex();
  const reported = useRef(!pending);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reload = privateLedger.reload;
  const loading = privateLedger.loading;
  const unlocked = privateLedger.unlocked;
  const userId = privateLedger.userId;
  const vaultId = privateLedger.vaultId;
  const keyId = privateLedger.keyId;
  const transactions = privateLedger.ledger.transactions;

  useEffect(() => {
    if (!pending || reported.current) return;
    if (loading || !unlocked) return;
    let cancelled = false;
    const write = vaultWriteReady({
      encryptedLedger: privateLedger.encryptedLedger,
      userId,
      vaultId,
      keyId,
      client: convex,
    });
    void applyBudgetEdit({
      input,
      transactions,
      vaultWrite: write,
      onVaultSaved: () => reload(),
    })
      .then((output) => {
        if (cancelled || reported.current) return;
        reported.current = true;
        onDoneRef.current(output);
      })
      .catch((error: unknown) => {
        if (cancelled || reported.current) return;
        reported.current = true;
        onDoneRef.current({
          ok: false,
          error: errorMessage(error, "Could not save the budget edit"),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    convex,
    input,
    keyId,
    loading,
    pending,
    privateLedger.encryptedLedger,
    reload,
    transactions,
    unlocked,
    userId,
    vaultId,
  ]);

  return null;
}
