"use client";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CleanMerchantsButton } from "@/domains/merchants/ui/CleanMerchantsButton";
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
            <li>Txns is the cached count of linked ledger rows</li>
            <li>Edit from the actions menu; linked ledger rows follow</li>
            <li>Rename to an existing merchant to merge them</li>
            <li>Add a logo with an upload or a URL</li>
            <li>Clean groups similar names, then AI merges the same payee</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export default function MerchantsPage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="type-page flex items-center gap-2">
            Merchants
            <MerchantsTitleInfo />
          </h1>
          <p className="sr-only">
            Stores and payees you spend with. Edit from the actions menu. Rename
            to an existing merchant to merge them. Clean groups similar names,
            then AI merges the same payee.
          </p>
        </div>
        <CleanMerchantsButton />
      </header>
      <MerchantsPanel />
    </div>
  );
}
