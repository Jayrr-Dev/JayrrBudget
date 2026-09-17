"use client";

import {
  createVaultTransaction,
  deleteVaultTransactions,
  recategorizeVaultMatching,
  renameVaultDescriptions,
  updateVaultTransaction,
  updateVaultTransactions,
} from "@/domains/ledger-ai/application/applyVaultLedgerWrite";
import {
  ADD_STORE_SHEET_ROW_TOOL_NAME,
  CREATE_TRANSACTION_TOOL_NAME,
  DELETE_TRANSACTIONS_TOOL_NAME,
  RECATEGORIZE_MATCHING_TOOL_NAME,
  REMOVE_STORE_SHEET_ROW_TOOL_NAME,
  RENAME_DESCRIPTIONS_TOOL_NAME,
  UPDATE_TRANSACTION_TOOL_NAME,
  UPDATE_TRANSACTIONS_TOOL_NAME,
  type AddStoreSheetRowInput,
  type CreateTransactionInput,
  type DeleteTransactionsInput,
  type RecategorizeMatchingInput,
  type RemoveStoreSheetRowInput,
  type RenameDescriptionsInput,
  type UpdateTransactionInput,
  type UpdateTransactionsInput,
} from "@/domains/ledger-ai/domain/vaultLedgerWriteTools";
import {
  useScratchNote,
  useScratchNoteActions,
} from "@/domains/scratch-note/scratchNoteStore";
import { vaultWriteReady } from "@/domains/vault/application/saveEncryptedLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import { useConvex } from "convex/react";
import { useEffect, useRef } from "react";

type VaultWriteToolName =
  | typeof CREATE_TRANSACTION_TOOL_NAME
  | typeof UPDATE_TRANSACTION_TOOL_NAME
  | typeof UPDATE_TRANSACTIONS_TOOL_NAME
  | typeof DELETE_TRANSACTIONS_TOOL_NAME
  | typeof RENAME_DESCRIPTIONS_TOOL_NAME
  | typeof RECATEGORIZE_MATCHING_TOOL_NAME
  | typeof ADD_STORE_SHEET_ROW_TOOL_NAME
  | typeof REMOVE_STORE_SHEET_ROW_TOOL_NAME;

function sameName(a: string | null | undefined, b: string) {
  return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

/** Runs one vault ledger/store-sheet write tool in the browser. */
export function PiggyVaultLedgerWrite({
  toolName,
  input,
  pending,
  onDone,
}: {
  toolName: VaultWriteToolName;
  input: unknown;
  pending: boolean;
  onDone: (output: unknown) => void;
}) {
  const privateLedger = usePrivateLedger();
  const scratch = useScratchNote();
  const scratchActions = useScratchNoteActions();
  const convex = useConvex();
  const reported = useRef(!pending);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reload = privateLedger.reload;
  const encrypted = privateLedger.encryptedLedger;
  const loading = privateLedger.loading;
  const unlocked = privateLedger.unlocked;
  const userId = privateLedger.userId;
  const vaultId = privateLedger.vaultId;
  const keyId = privateLedger.keyId;
  const transactions = privateLedger.ledger.transactions;
  const accounts = privateLedger.ledger.accounts;

  useEffect(() => {
    if (!pending || reported.current) return;
    if (encrypted && (loading || !unlocked)) return;

    const write = vaultWriteReady({
      encryptedLedger: encrypted,
      userId,
      vaultId,
      keyId,
      client: convex,
    });
    if (!write) {
      reported.current = true;
      onDoneRef.current({
        ok: false,
        error: "Unlock the vault so Piggy can save this change.",
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        let output: unknown;
        switch (toolName) {
          case CREATE_TRANSACTION_TOOL_NAME:
            output = await createVaultTransaction({
              input: input as CreateTransactionInput,
              accounts,
              vaultWrite: write,
            });
            break;
          case UPDATE_TRANSACTION_TOOL_NAME:
            output = await updateVaultTransaction({
              input: input as UpdateTransactionInput,
              transactions,
              vaultWrite: write,
            });
            break;
          case UPDATE_TRANSACTIONS_TOOL_NAME:
            output = await updateVaultTransactions({
              input: input as UpdateTransactionsInput,
              transactions,
              vaultWrite: write,
            });
            break;
          case DELETE_TRANSACTIONS_TOOL_NAME:
            output = await deleteVaultTransactions({
              input: input as DeleteTransactionsInput,
              vaultWrite: write,
            });
            break;
          case RENAME_DESCRIPTIONS_TOOL_NAME:
            output = await renameVaultDescriptions({
              input: input as RenameDescriptionsInput,
              transactions,
              vaultWrite: write,
            });
            break;
          case RECATEGORIZE_MATCHING_TOOL_NAME:
            output = await recategorizeVaultMatching({
              input: input as RecategorizeMatchingInput,
              transactions,
              vaultWrite: write,
            });
            break;
          case ADD_STORE_SHEET_ROW_TOOL_NAME: {
            const row = input as AddStoreSheetRowInput;
            const tabName = row.tabName?.trim();
            if (tabName) {
              const tab = scratch.tabs.find(
                (item) =>
                  sameName(item.name, tabName) || sameName(item.id, tabName),
              );
              if (!tab) {
                output = {
                  ok: false,
                  error: `Store sheet tab not found: ${tabName}`,
                };
                break;
              }
              scratchActions.setReceiveTab(tab.id);
            }
            await scratchActions.addRow({
              name: row.name,
              spend: row.spend,
              count: row.count ?? 1,
              currency: row.currency?.trim() || "CAD",
              parent: row.parent,
            });
            output = { ok: true, tabId: scratch.receiveId };
            break;
          }
          case REMOVE_STORE_SHEET_ROW_TOOL_NAME: {
            const row = input as RemoveStoreSheetRowInput;
            const tabName = row.tabName?.trim();
            const tab = tabName
              ? scratch.tabs.find(
                  (item) =>
                    sameName(item.name, tabName) || sameName(item.id, tabName),
                )
              : (scratch.tabs.find((item) => item.id === scratch.activeId) ??
                scratch.tabs[0]);
            if (!tab) {
              output = { ok: false, error: "Store sheet tab not found." };
              break;
            }
            const target = row.rowId
              ? tab.rows.find((item) => item.id === row.rowId)
              : tab.rows.find((item) => sameName(item.name, row.name ?? ""));
            if (!target) {
              output = { ok: false, error: "Store sheet row not found." };
              break;
            }
            scratchActions.removeRow(target.id);
            output = { ok: true, removed: true, rowId: target.id };
            break;
          }
          default:
            output = { ok: false, error: `Unknown vault tool: ${toolName}` };
        }
        if (cancelled || reported.current) return;
        reported.current = true;
        if (
          toolName !== ADD_STORE_SHEET_ROW_TOOL_NAME &&
          toolName !== REMOVE_STORE_SHEET_ROW_TOOL_NAME &&
          output &&
          typeof output === "object" &&
          "ok" in output &&
          (output as { ok: boolean }).ok
        ) {
          reload();
        }
        onDoneRef.current(output);
      } catch (error) {
        if (cancelled || reported.current) return;
        reported.current = true;
        onDoneRef.current({
          ok: false,
          error: errorMessage(error, "Could not save that vault change"),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accounts,
    convex,
    encrypted,
    input,
    keyId,
    loading,
    pending,
    reload,
    scratch,
    scratchActions,
    toolName,
    transactions,
    unlocked,
    userId,
    vaultId,
  ]);

  return null;
}
