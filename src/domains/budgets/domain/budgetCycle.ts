import { addDays, addMonths, addWeeks, addYears, startOfDay } from "date-fns";

export const BUDGET_CYCLES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
] as const;

export type BudgetCycle = (typeof BUDGET_CYCLES)[number];

export const BUDGET_CYCLE_LABELS: Record<BudgetCycle, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isBudgetCycle(value: string): value is BudgetCycle {
  return (BUDGET_CYCLES as readonly string[]).includes(value);
}

export function parseBudgetCycle(
  value: string | null | undefined,
): BudgetCycle {
  const key = value?.trim().toLowerCase() ?? "";
  if (isBudgetCycle(key)) return key;
  return "monthly";
}

export function parseBudgetYmd(value: string | null | undefined): Date | null {
  const match = YMD.exec(value?.trim() ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function toBudgetYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayBudgetYmd(now = new Date()): string {
  return toBudgetYmd(now);
}

export function addBudgetCycle(start: Date, cycle: BudgetCycle): Date {
  if (cycle === "daily") return addDays(start, 1);
  if (cycle === "weekly") return addWeeks(start, 1);
  if (cycle === "biweekly") return addWeeks(start, 2);
  if (cycle === "monthly") return addMonths(start, 1);
  return addYears(start, 1);
}

export function currentBudgetSlice(
  cycle: BudgetCycle,
  startDate: string | null | undefined,
  now = new Date(),
): { start: string; end: string } {
  const today = startOfDay(now);
  const origin = parseBudgetYmd(startDate) ?? today;
  let cursor = origin;
  let next = addBudgetCycle(cursor, cycle);
  let guard = 0;
  while (next.getTime() <= today.getTime() && guard < 20000) {
    cursor = next;
    next = addBudgetCycle(cursor, cycle);
    guard += 1;
  }
  return {
    start: toBudgetYmd(cursor),
    end: toBudgetYmd(addDays(next, -1)),
  };
}

export function dateInBudgetSlice(
  date: string | null | undefined,
  cycle: BudgetCycle,
  startDate: string | null | undefined,
  now = new Date(),
): boolean {
  const day = date?.trim().slice(0, 10) ?? "";
  if (!YMD.test(day)) return false;
  const window = currentBudgetSlice(cycle, startDate, now);
  return day >= window.start && day <= window.end;
}
