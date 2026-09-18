"use client";

import { CleanMerchantsButton } from "@/domains/merchants/ui/CleanMerchantsButton";
import { MerchantsPanel } from "@/domains/merchants/ui/MerchantsPanel";
import { TitleInfo } from "@/domains/ops/ui/TitleInfo";

export default function MerchantsPage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <TitleInfo
            title="Merchants"
            lead="Stores and payees you spend with."
            bullets={[
              "One row per payee after a statement labels it",
              "Txns is the cached count of linked ledger rows",
              "Edit from the actions menu; linked ledger rows follow",
              "Rename to an existing merchant to merge them",
              "Add a logo with an upload or a URL",
              "Clean groups similar names, then AI merges the same payee",
            ]}
          />
          <p className="sr-only">
            Stores and payees you spend with. Edit from the actions menu. Rename
            to an existing merchant to merge them. Clean groups similar names,
            then AI merges the same payee.
          </p>
        </div>
        <div className="shrink-0">
          <CleanMerchantsButton />
        </div>
      </header>
      <MerchantsPanel />
    </div>
  );
}
