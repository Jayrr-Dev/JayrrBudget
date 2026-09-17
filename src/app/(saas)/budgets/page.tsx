"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BudgetsManager } from "@/domains/budgets/ui/BudgetsManager";
import { Info } from "lucide-react";

function BudgetsTitleInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-11 sm:size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
          aria-label="About Budgets"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Budgets</PopoverTitle>
          <PopoverDescription>
            Spend caps you set, or ones Piggy creates in chat.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Amount is the cap</li>
            <li>Class lookup matches a section, category, or subcategory</li>
            <li>Description lookup matches a merchant or description later</li>
            <li>Warning and overage are percents of that cap</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export default function BudgetsPage() {
  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <h1 className="type-page flex items-center gap-2">
          Budgets
          <BudgetsTitleInfo />
        </h1>
        <p className="sr-only">
          Spend caps you set, or ones Piggy creates in chat. Amount is the
          cap. Warning and overage are percents of that cap.
        </p>
      </header>
      <BudgetsManager />
    </div>
  );
}
