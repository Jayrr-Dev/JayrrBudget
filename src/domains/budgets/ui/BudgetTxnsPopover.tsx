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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BUDGET_TXN_PEEK_LIMIT,
  type BudgetTxnPeek,
} from "@/domains/budgets/domain/budgetProgress";
import { MoneyText } from "@/domains/dashboard/ui/MoneyText";
import {
  keepTxnPeekPopoverOpen,
} from "@/domains/merchants/ui/MerchantTxnsPopover";
import {
  DescriptionActionsButton,
  EditDescriptionDialog,
} from "@/domains/transactions/ui/EditDescriptionDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatCompactDisplayDate,
  formatShortDisplayDate,
} from "@/shared/lib/format-date";
import { Info } from "lucide-react";
import { useState } from "react";

function txnPeekCountLabel(count: number) {
  const plus = count >= BUDGET_TXN_PEEK_LIMIT ? "+" : "";
  const noun = count === 1 ? "txn" : "txns";
  return `${count}${plus} ${noun}`;
}

export function BudgetTxnsPopover({
  budgetName,
  lookup,
  transactions,
}: {
  budgetName: string;
  lookup: string | null;
  transactions: BudgetTxnPeek[];
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [editDescription, setEditDescription] = useState<string | null>(null);
  const nestedOpen = editDescription != null;
  const countLabel = txnPeekCountLabel(transactions.length);
  const subtitle = lookup?.trim() || null;

  const trigger = (
    <button
      type="button"
      aria-label={`Transactions for ${budgetName}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute top-2 right-2 z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-accent hover:text-primary sm:size-6"
    >
      <Info className="size-3.5" />
    </button>
  );

  const titleRow = (
    <div className="flex min-w-0 items-baseline gap-2 text-sm font-medium">
      <span className="min-w-0 truncate">{budgetName}</span>
      <span className="shrink-0 font-normal text-muted-foreground">
        {countLabel}
      </span>
    </div>
  );

  const subtitleRow = subtitle ? (
    <p className="mt-1 text-sm font-normal text-muted-foreground">{subtitle}</p>
  ) : null;

  const list = (
    <TooltipProvider>
      <div
        className={
          isMobile
            ? "min-h-0 flex-1 overflow-auto scrollbar-gutter-stable"
            : "max-h-72 overflow-auto scrollbar-gutter-stable"
        }
      >
        {transactions.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No matching spend in this cycle.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-sm md:min-w-[20rem]">
              <tbody>
                {transactions.map((txn, index) => {
                  const isCredit = txn.amount < 0;
                  return (
                    <tr
                      key={`${txn.date}-${txn.description}-${index}`}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="w-8 p-0 align-middle">
                        <div className="flex items-center justify-center py-1 md:py-1.5">
                          <DescriptionActionsButton
                            description={txn.description}
                            onEdit={setEditDescription}
                          />
                        </div>
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
    <EditDescriptionDialog
      open={editDescription != null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setEditDescription(null);
      }}
      currentDescription={editDescription ?? ""}
    />
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
            <DialogHeader className="border-b border-border px-3 py-2 pr-10">
              <div className={subtitle ? "flex items-start" : "flex items-center"}>
                <div className="min-w-0">
                  <DialogTitle className="text-sm">{titleRow}</DialogTitle>
                  {subtitleRow}
                  <DialogDescription className="sr-only">
                    Matching transactions for {budgetName} in the current cycle.
                  </DialogDescription>
                </div>
              </div>
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
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next && nestedOpen) return;
          setOpen(next);
        }}
      >
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
          <div
            className={`border-b border-border px-3 py-2 ${
              subtitle ? "flex items-start" : "flex items-center"
            }`}
          >
            <div className="min-w-0">
              {titleRow}
              {subtitleRow}
            </div>
          </div>
          {list}
        </PopoverContent>
      </Popover>
      {nestedDialogs}
    </>
  );
}
