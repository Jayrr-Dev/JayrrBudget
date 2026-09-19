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
  isActive?: boolean;
  cycle?: BudgetCycle | string | null;
  startDate?: string | null;
};

export type BudgetSpendLine = {
  date?: string | null;
  amount: number;
  description: string;
  currency?: string | null;
  merchantName?: string | null;
  merchantClean?: string | null;
  sectionName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  spreadName?: string | null;
  transactionTypeName?: string | null;
};

export type BudgetTxnPeek = {
  date: string;
  description: string;
  amount: number;
  currency: string;
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
  transactions: BudgetTxnPeek[];
};

export const BUDGET_TXN_PEEK_LIMIT = 48;

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

/** Remaining ratio 1 = full budget left (blue); 0 = depleted (red). */
const RING_COLOR_STOPS: ReadonlyArray<{ at: number; hex: string }> = [
  { at: 1, hex: "#38bdf8" }, // sky-400 — full remaining
  { at: 0.8, hex: "#488f31" },
  { at: 0.6, hex: "#89bf77" },
  { at: 0.4, hex: "#fff18f" },
  { at: 0.2, hex: "#f59b56" },
  { at: 0, hex: "#de425b" },
];

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Ring stroke for remaining ratio (1 = full left, 0 = empty/over). */
export function budgetProgressRingColor(remainingRatio: number): string {
  const t = Math.min(1, Math.max(0, remainingRatio));
  for (let i = 0; i < RING_COLOR_STOPS.length - 1; i++) {
    const high = RING_COLOR_STOPS[i]!;
    const low = RING_COLOR_STOPS[i + 1]!;
    if (t <= low.at) continue;
    if (t >= high.at) return high.hex;
    const span = high.at - low.at;
    const local = span === 0 ? 0 : (t - low.at) / span;
    return mixHex(low.hex, high.hex, local);
  }
  return RING_COLOR_STOPS[RING_COLOR_STOPS.length - 1]!.hex;
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

function sortBudgetTxnPeeks(peeks: BudgetTxnPeek[]) {
  return peeks
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function peeksForBudget(
  lines: BudgetSpendLine[],
  budget: BudgetCap,
): BudgetTxnPeek[] {
  const cycle = parseBudgetCycle(budget.cycle);
  const peeks: BudgetTxnPeek[] = [];
  for (const line of lines) {
    if (!dateInBudgetSlice(line.date, cycle, budget.startDate)) continue;
    if (!transactionMatchesBudget(line, budget)) continue;
    const date = line.date?.trim();
    if (!date) continue;
    peeks.push({
      date,
      description: line.description,
      amount: line.amount,
      currency: line.currency?.trim() || "CAD",
    });
  }
  return sortBudgetTxnPeeks(peeks).slice(0, BUDGET_TXN_PEEK_LIMIT);
}

export function buildBudgetProgressItems(
  budgets: BudgetCap[],
  lines: BudgetSpendLine[],
): BudgetProgressItem[] {
  return budgets
    .filter((budget) => budget.isActive !== false)
    .map((budget) => {
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
      transactions: peeksForBudget(lines, budget),
    };
  });
}
