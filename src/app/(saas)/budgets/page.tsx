"use client";

import { Button } from "@/components/ui/button";
import {
  BudgetsManager,
  CreateBudgetDialog,
} from "@/domains/budgets/ui/BudgetsManager";
import { TitleInfo } from "@/domains/ops/ui/TitleInfo";
import { useState } from "react";

export default function BudgetsPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <TitleInfo
            title="Budgets"
            lead="Spend caps you set, or ones Jev creates in chat."
            bullets={[
              "Amount is the cap for the current cycle slice",
              "Cycle is daily, weekly, bi-weekly, monthly, or yearly",
              "Start date is when that slice starts repeating",
              "Class lookup matches a section, category, or subcategory",
              "Description lookup matches a merchant or description later",
              "Warning and overage are percents of that cap",
            ]}
          />
          <p className="sr-only">
            Spend caps you set, or ones Jev creates in chat. Amount is the cap
            for the current cycle slice from the start date.
          </p>
        </div>
        <Button type="button" className="shrink-0" onClick={() => setCreateOpen(true)}>
          New budget
        </Button>
      </header>
      <BudgetsManager onNewBudget={() => setCreateOpen(true)} />
      <CreateBudgetDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
