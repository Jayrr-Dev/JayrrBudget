"use client";

import { classifyCashFlow } from "@/domains/analysis/domain/cashFlow";
import {
  toBudgetYmd,
  type BudgetCycle,
} from "@/domains/budgets/domain/budgetCycle";
import {
  buildBudgetProgressItems,
  type BudgetSpendLine,
} from "@/domains/budgets/domain/budgetProgress";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useMemo } from "react";

type ClassCatalog = {
  sections: { name: string }[];
  categories: { name: string }[];
  subcategories: { name: string }[];
};

export type BudgetTableRow = {
  id: Id<"budgets">;
  name: string;
  classLookup: string | null;
  descriptionLookup: string | null;
  lookupTable: string;
  amount: number;
  warningThreshold: number;
  overageThreshold: number;
  isActive: boolean;
  cycle: BudgetCycle;
  startDate: string;
  createdAt: number;
  updatedAt: number;
};

function lookupTableLabel(
  catalog: ClassCatalog | undefined,
  classLookup: string | null,
): string {
  const value = classLookup?.trim().toLowerCase() ?? "";
  if (!value || !catalog) return "—";
  const has = (rows: { name: string }[]) =>
    rows.some((row) => row.name.trim().toLowerCase() === value);
  if (has(catalog.subcategories)) return "Subcategory";
  if (has(catalog.categories)) return "Category";
  if (has(catalog.sections)) return "Section";
  return "Custom";
}

export function useBudgetProgressItems() {
  const budgets = useQuery(api.budgets.list, {});
  const catalog = useQuery(api.classifications.list, {});
  const privateLedger = usePrivateLedger();
  const rows = useMemo((): BudgetTableRow[] => {
    if (!budgets) return [];
    return budgets.map((budget) => ({
      ...budget,
      lookupTable: lookupTableLabel(catalog, budget.classLookup),
      startDate: budget.startDate || toBudgetYmd(new Date(budget.createdAt)),
    }));
  }, [budgets, catalog]);

  const progressItems = useMemo(() => {
    if (!rows.length) return [];
    const accountTypeById = new Map(
      privateLedger.ledger.accounts.map((account) => [
        account.accountId,
        account.type ?? null,
      ]),
    );
    const lines: BudgetSpendLine[] = [];
    for (const txn of privateLedger.ledger.transactions) {
      const kind = classifyCashFlow({
        amountMinor: Math.round(txn.amount * 100),
        description: txn.description,
        accountType: txn.accountId
          ? (accountTypeById.get(txn.accountId) ?? null)
          : null,
        sectionName: txn.sectionName ?? null,
        categoryName: txn.categoryName ?? null,
        typeName: txn.transactionTypeName ?? null,
        transactionCode: txn.txnCode ?? null,
      });
      if (kind !== "spend") continue;
      lines.push({
        date: txn.date,
        amount: txn.amount,
        description: txn.description,
        merchantName: txn.merchantName,
        merchantClean: txn.merchantClean,
        sectionName: txn.sectionName,
        categoryName: txn.categoryName,
        subcategoryName: txn.subcategoryName,
        spreadName: txn.spreadName,
        transactionTypeName: txn.transactionTypeName,
      });
    }
    return buildBudgetProgressItems(rows, lines);
  }, [rows, privateLedger.ledger]);

  return { budgets, rows, progressItems };
}
