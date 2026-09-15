/** Amount filter: $0.01-$10 (abs), plus credits (money in). */

export type LogMoneyRangeOption = {
  value: string;
  label: string;
};

const SMALL_MIN = 0.01;
const SMALL_MAX = 10;
export const SMALL_AMOUNT_RANGE_KEY = "abs:0.01-10";
export const CREDITS_FILTER_KEY = "credits";

function formatBound(n: number) {
  if (n >= 1) {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function amountMatchesLogRange(
  amount: number,
  filterValue: string,
): boolean {
  const key = filterValue.trim();
  if (!key || key === "all") return true;
  if (!Number.isFinite(amount)) return false;

  if (key === CREDITS_FILTER_KEY) {
    return amount < 0;
  }

  if (key === SMALL_AMOUNT_RANGE_KEY) {
    const abs = Math.abs(amount);
    return abs >= SMALL_MIN && abs <= SMALL_MAX;
  }

  return false;
}

export const LOG_MONEY_RANGE_OPTIONS: LogMoneyRangeOption[] = [
  {
    value: SMALL_AMOUNT_RANGE_KEY,
    label: `${formatBound(SMALL_MIN)} - ${formatBound(SMALL_MAX)}`,
  },
  {
    value: CREDITS_FILTER_KEY,
    label: "Credits",
  },
];
