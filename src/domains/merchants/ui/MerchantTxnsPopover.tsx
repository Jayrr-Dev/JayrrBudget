"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { MoneyText } from "@/domains/dashboard/ui/MoneyText";
import { MoveMerchantDialog } from "@/domains/merchants/ui/MoveMerchantDialog";
import {
  DescriptionActionsButton,
  EditDescriptionDialog,
} from "@/domains/transactions/ui/EditDescriptionDialog";
import { formatShortDisplayDate } from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";

export const MERCHANT_TXN_PEEK_LIMIT = 48;

export type MerchantTxnPeek = {
  date: string;
  description: string;
  amount: number;
  currency: string;
};

export function MerchantTxnsPopover({
  merchantId,
  merchantName,
  vaultPeeks,
}: {
  merchantId: string;
  merchantName: string;
  vaultPeeks?: MerchantTxnPeek[];
}) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editDescription, setEditDescription] = useState<string | null>(null);
  const useVault = vaultPeeks !== undefined;
  const remote = useQuery(
    api.merchants.listTransactionPeeks,
    useVault || !open ? "skip" : { merchantId: merchantId as Id<"merchants"> },
  );
  const peeks = useVault ? vaultPeeks : remote;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Transactions for ${merchantName}`}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
          >
            <Info className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="left"
          sideOffset={8}
          className="w-[min(34rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
          onPointerDownOutside={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (
              target.closest("[data-slot=dropdown-menu-content]") ||
              target.closest("[data-slot=dialog-content]") ||
              target.closest("[data-slot=dropdown-menu]") ||
              target.closest("[data-slot=combobox-content]")
            ) {
              event.preventDefault();
            }
          }}
          onFocusOutside={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (
              target.closest("[data-slot=dropdown-menu-content]") ||
              target.closest("[data-slot=dialog-content]") ||
              target.closest("[data-slot=combobox-content]")
            ) {
              event.preventDefault();
            }
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
            <div className="min-w-0 text-sm font-medium">
              {merchantName}
              {peeks ? (
                <span className="ml-2 font-normal text-[var(--muted-foreground)]">
                  {peeks.length}
                  {peeks.length >= MERCHANT_TXN_PEEK_LIMIT ? "+" : ""} txn
                  {peeks.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <RowActionsMenu
              label={merchantName}
              size="sm"
              actions={[
                {
                  label: "Move",
                  onSelect: () => {
                    setOpen(false);
                    setMoveOpen(true);
                  },
                },
              ]}
            />
          </div>
          <TooltipProvider>
            <div className="max-h-72 overflow-auto">
              {peeks === undefined ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner className="size-5" />
                </div>
              ) : peeks.length === 0 ? (
                <p className="px-3 py-4 text-sm text-[var(--muted-foreground)]">
                  No linked ledger rows yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {peeks.map((txn, index) => {
                      const isCredit = txn.amount < 0;
                      return (
                        <tr
                          key={`${txn.date}-${txn.description}-${index}`}
                          className="border-b border-[var(--border)] last:border-b-0"
                        >
                          <td className="w-8 px-1 py-1 align-top">
                            <DescriptionActionsButton
                              description={txn.description}
                              onEdit={setEditDescription}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 align-top tabular-nums text-[var(--muted-foreground)]">
                            {formatShortDisplayDate(txn.date)}
                          </td>
                          <td className="max-w-[12rem] px-2 py-1.5 align-top text-[var(--foreground)]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block truncate">
                                  {txn.description}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                sideOffset={6}
                                className="z-[60] max-w-sm text-left leading-snug"
                              >
                                {txn.description}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right align-top">
                            <MoneyText
                              amount={Math.abs(txn.amount)}
                              currency={txn.currency}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right align-top">
                            <span
                              className={`text-xs font-medium tabular-nums ${
                                isCredit
                                  ? "text-[var(--foreground)]"
                                  : "text-[var(--muted-foreground)]"
                              }`}
                              aria-label={isCredit ? "Credit" : "Debit"}
                            >
                              {isCredit ? "CR" : "DR"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </TooltipProvider>
        </PopoverContent>
      </Popover>
      <EditDescriptionDialog
        open={editDescription != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditDescription(null);
        }}
        currentDescription={editDescription ?? ""}
      />
      <MoveMerchantDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        merchantName={merchantName}
        merchantId={useVault ? undefined : merchantId}
      />
    </>
  );
}
