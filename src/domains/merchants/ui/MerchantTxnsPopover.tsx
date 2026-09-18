"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoneyText } from "@/domains/dashboard/ui/MoneyText";
import { MoveMerchantDialog } from "@/domains/merchants/ui/MoveMerchantDialog";
import {
  DescriptionActionsButton,
  EditDescriptionDialog,
} from "@/domains/transactions/ui/EditDescriptionDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatCompactDisplayDate,
  formatShortDisplayDate,
} from "@/shared/lib/format-date";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Info } from "lucide-react";
import { useState } from "react";

export const MERCHANT_TXN_PEEK_LIMIT = 48;

export function keepTxnPeekPopoverOpen(event: {
  preventDefault: () => void;
  target: EventTarget | null;
}) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (
    target.closest("[data-slot=dropdown-menu-content]") ||
    target.closest("[data-slot=dropdown-menu-trigger]") ||
    target.closest("[data-slot=dialog-content]") ||
    target.closest("[data-slot=dropdown-menu]") ||
    target.closest("[data-slot=combobox-content]")
  ) {
    event.preventDefault();
  }
}

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
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editDescription, setEditDescription] = useState<string | null>(null);
  const nestedOpen = editDescription != null || moveOpen;
  const useVault = vaultPeeks !== undefined;
  const remote = useQuery(
    api.merchants.listTransactionPeeks,
    useVault || !open ? "skip" : { merchantId: merchantId as Id<"merchants"> },
  );
  const peeks = useVault ? vaultPeeks : remote;
  const countLabel = peeks
    ? `${peeks.length}${peeks.length >= MERCHANT_TXN_PEEK_LIMIT ? "+" : ""} txn${
        peeks.length === 1 ? "" : "s"
      }`
    : null;

  const trigger = (
    <button
      type="button"
      aria-label={`Transactions for ${merchantName}`}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary max-md:size-11"
    >
      <Info className="size-3.5" />
    </button>
  );

  const headerActions = (
    <RowActionsMenu
      label={merchantName}
      size="xs"
      actions={[
        {
          label: "Move",
          onSelect: () => {
            setMoveOpen(true);
          },
        },
      ]}
    />
  );

  const list = (
    <TooltipProvider>
      <div
        className={
          isMobile
            ? "min-h-0 flex-1 overflow-auto scrollbar-gutter-stable"
            : "max-h-72 overflow-auto scrollbar-gutter-stable"
        }
      >
        {peeks === undefined ? (
          <div className="flex items-center justify-center py-6">
            <Spinner className="size-5" />
          </div>
        ) : peeks.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No linked ledger rows yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm md:min-w-[20rem]">
              <tbody>
                {peeks.map((txn, index) => {
                  const isCredit = txn.amount < 0;
                  return (
                    <tr
                      key={`${txn.date}-${txn.description}-${index}`}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="w-4 px-1 py-1 align-middle md:px-1.5 md:py-1.5">
                        <DescriptionActionsButton
                          description={txn.description}
                          onEdit={setEditDescription}
                        />
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-1 align-top tabular-nums text-muted-foreground md:px-3 md:py-1.5">
                        <span className="md:hidden">
                          {formatCompactDisplayDate(txn.date)}
                        </span>
                        <span className="hidden md:inline">
                          {formatShortDisplayDate(txn.date)}
                        </span>
                      </td>
                      <td className="max-w-[9rem] px-1.5 py-1 align-top text-foreground md:max-w-[12rem] md:px-2 md:py-1.5">
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
                      <td className="w-[1%] whitespace-nowrap px-1.5 py-1 pr-2 text-right align-top md:px-2 md:py-1.5 md:pr-3">
                        <span className="sr-only">
                          {isCredit ? "Credit" : "Debit"}
                        </span>
                        <MoneyText
                          amount={Math.abs(txn.amount)}
                          currency={txn.currency}
                          className={
                            isCredit
                              ? "text-[var(--income)]"
                              : "text-[var(--spend)]"
                          }
                        />
                      </td>
                      <td className="hidden px-3 py-1.5 text-right align-top md:table-cell">
                        <span
                          className={`text-xs font-medium tabular-nums ${
                            isCredit
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                          aria-hidden="true"
                        >
                          {isCredit ? "CR" : "DR"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TooltipProvider>
  );

  const nestedDialogs = (
    <>
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

  if (isMobile) {
    return (
      <>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!next && nestedOpen) return;
            setOpen(next);
          }}
        >
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
            onInteractOutside={(event) => {
              keepTxnPeekPopoverOpen(event);
            }}
          >
            <DialogHeader className="border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="shrink-0">{headerActions}</div>
                <DialogTitle className="flex min-w-0 items-baseline gap-2 text-sm">
                  <span className="min-w-0 truncate">{merchantName}</span>
                  {countLabel ? (
                    <span className="shrink-0 font-normal text-muted-foreground">
                      {countLabel}
                    </span>
                  ) : null}
                </DialogTitle>
              </div>
              <DialogDescription className="sr-only">
                Recent transactions for {merchantName}.
              </DialogDescription>
            </DialogHeader>
            {list}
          </DialogContent>
        </Dialog>
        {nestedDialogs}
      </>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          side="left"
          sideOffset={8}
          className="w-[min(34rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
          onPointerDownOutside={(event) => {
            keepTxnPeekPopoverOpen(event);
          }}
          onFocusOutside={(event) => {
            keepTxnPeekPopoverOpen(event);
          }}
          onInteractOutside={(event) => {
            keepTxnPeekPopoverOpen(event);
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <div className="shrink-0">{headerActions}</div>
            <div className="min-w-0 text-sm font-medium">
              {merchantName}
              {countLabel ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  {countLabel}
                </span>
              ) : null}
            </div>
          </div>
          {list}
        </PopoverContent>
      </Popover>
      {nestedDialogs}
    </>
  );
}
