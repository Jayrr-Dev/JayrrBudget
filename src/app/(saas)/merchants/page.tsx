"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MerchantsPanel } from "@/domains/merchants/ui/MerchantsPanel";
import { Info } from "lucide-react";

function MerchantsTitleInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
          aria-label="About merchants"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Merchants</PopoverTitle>
          <PopoverDescription>
            Stores and payees you spend with.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>One row per payee after a statement labels it</li>
            <li>Fix a name once; it updates on matching ledger rows</li>
            <li>Slug, company, and brand live under Columns</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export default function MerchantsPage() {
  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--border)] pb-6">
        <h1 className="type-page flex items-center gap-2">
          Merchants
          <MerchantsTitleInfo />
        </h1>
        <p className="sr-only">
          Stores and payees you spend with. Fix a name once; it updates
          everywhere.
        </p>
      </header>
      <MerchantsPanel />
    </div>
  );
}
