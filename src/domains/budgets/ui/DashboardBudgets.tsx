"use client";

import { BudgetProgressCards } from "@/domains/budgets/ui/BudgetProgressCards";
import { useBudgetProgressItems } from "@/domains/budgets/ui/useBudgetProgressItems";
import Link from "next/link";

/** Dashboard rings under lending. Hidden when there are no budgets. */
export function DashboardBudgets() {
  const { progressItems } = useBudgetProgressItems();
  if (progressItems.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <h2 className="text-[14px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          <Link href="/budgets" className="hover:text-foreground">
            Budgets
          </Link>
        </h2>
      </div>
      <BudgetProgressCards items={progressItems} href="/budgets" />
    </section>
  );
}
