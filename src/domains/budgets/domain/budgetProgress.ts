import {
  currentBudgetSlice,
  dateInBudgetSlice,
  parseBudgetCycle,
  type BudgetCycle,
} from "@/domains/budgets/domain/budgetCycle";

export type BudgetProgressTone = "ok" | "warn" | "over";

export type BudgetCap = {
  id: string;
  name: string;
  classLookup: string | null;
  descriptionLookup: string | null;
  amount: number;
  warningThreshold: number;
  overageThreshold: number;
  cycle?: BudgetCycle | string | null;
  startDate?: string | null;
};

export type BudgetSpendLine = {
  date?: string | null;
  amount: number;
  description: string;
  merchantName?: string | null;
  merchantClean?: string | null;
  sectionName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  spreadName?: string | null;
  transactionTypeName?: string | null;
};

export type BudgetProgressItem = {
  id: string;
  name: string;
  lookup: string | null;
  cycle: BudgetCycle;
  periodStart: string;
  amount: number;
  spent: number;
  remaining: number;
  percent: number;
  warningThreshold: number;
  overageThreshold: number;
};

function norm(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function budgetUsedPercent(spent: number, cap: number) {
  if (!(cap > 0)) {
    if (spent > 0) return 100;
    return 0;
  }
  return (spent / cap) * 100;
}

export function budgetProgressTone(
  percent: number,
  warningThreshold = 80,
  overageThreshold = 100,
): BudgetProgressTone {
  if (percent >= overageThreshold) return "over";
  if (percent >= warningThreshold) return "warn";
  return "ok";
}

export function transactionMatchesBudget(
  line: BudgetSpendLine,
  budget: Pick<BudgetCap, "classLookup" | "descriptionLookup">,
) {
  const classLookup = norm(budget.classLookup);
  const descriptionLookup = norm(budget.descriptionLookup);
  if (!classLookup && !descriptionLookup) return false;

  if (classLookup) {
    const labels = [
      line.sectionName,
      line.categoryName,
      line.subcategoryName,
      line.spreadName,
      line.transactionTypeName,
    ].map(norm);
    if (!labels.includes(classLookup)) return false;
  }

  if (descriptionLookup) {
    const blob = [line.description, line.merchantName, line.merchantClean]
      .map(norm)
      .join(" ");
    if (!blob.includes(descriptionLookup)) return false;
  }

  return true;
}

export function spentForBudget(lines: BudgetSpendLine[], budget: BudgetCap) {
  const cycle = parseBudgetCycle(budget.cycle);
  let spent = 0;
  for (const line of lines) {
    if (!dateInBudgetSlice(line.date, cycle, budget.startDate)) continue;
    if (!transactionMatchesBudget(line, budget)) continue;
    spent += line.amount;
  }
  return spent;
}

export function buildBudgetProgressItems(
  budgets: BudgetCap[],
  lines: BudgetSpendLine[],
): BudgetProgressItem[] {
  return budgets.map((budget) => {
    const cycle = parseBudgetCycle(budget.cycle);
    const spent = spentForBudget(lines, budget);
    const lookup =
      budget.classLookup?.trim() || budget.descriptionLookup?.trim() || null;
    return {
      id: budget.id,
      name: budget.name,
      lookup,
      cycle,
      periodStart: currentBudgetSlice(cycle, budget.startDate).start,
      amount: budget.amount,
      spent,
      remaining: budget.amount - spent,
      percent: budgetUsedPercent(spent, budget.amount),
      warningThreshold: budget.warningThreshold,
      overageThreshold: budget.overageThreshold,
    };
  });
}
