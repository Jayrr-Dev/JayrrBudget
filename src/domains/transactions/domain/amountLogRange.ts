/** Amount filter: absolute magnitude ranges (ignore +/-), plus credits/debits. */

export type LogMoneyRangeOption = {
  value: string;
  label: string;
};

const SMALL_MIN = 0.01;
const SMALL_MAX = 10;
export const SMALL_AMOUNT_RANGE_KEY = "abs:0.01-10";
export const CREDITS_FILTER_KEY = "credits";
export const DEBITS_FILTER_KEY = "debits";

const ABS_RANGE_RE = /^abs:(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;
const ABS_MIN_RE = /^abs:(\d+(?:\.\d+)?)\+$/;

function formatBound(n: number) {
  if (n >= 1) {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function parseAbsRange(key: string): { min: number; max: number } | null {
  const match = ABS_RANGE_RE.exec(key);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function parseAbsMin(key: string): number | null {
  const match = ABS_MIN_RE.exec(key);
  if (!match) return null;
  const min = Number(match[1]);
  return Number.isFinite(min) ? min : null;
}

/** Match signed ledger amount against abs range / credit / debit filters. */
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
  if (key === DEBITS_FILTER_KEY) {
    return amount > 0;
  }

  const abs = Math.abs(amount);

  const range = parseAbsRange(key);
  if (range) {
    // First bucket is closed; later buckets are (prevMax, max] so $10 isn't double-counted.
    if (key === SMALL_AMOUNT_RANGE_KEY) {
      return abs >= range.min && abs <= range.max;
    }
    return abs > range.min && abs <= range.max;
  }

  const minOnly = parseAbsMin(key);
  if (minOnly != null) {
    return abs > minOnly;
  }

  return false;
}

export const LOG_MONEY_RANGE_OPTIONS: LogMoneyRangeOption[] = [
  {
    value: SMALL_AMOUNT_RANGE_KEY,
    label: `Abs ${formatBound(SMALL_MIN)} - ${formatBound(SMALL_MAX)}`,
  },
  {
    value: "abs:10-100",
    label: `Abs ${formatBound(10)} - ${formatBound(100)}`,
  },
  {
    value: "abs:100-1000",
    label: `Abs ${formatBound(100)} - ${formatBound(1000)}`,
  },
  {
    value: "abs:1000+",
    label: `Abs ${formatBound(1000)}+`,
  },
  {
    value: CREDITS_FILTER_KEY,
    label: "Credits",
  },
  {
    value: DEBITS_FILTER_KEY,
    label: "Debits",
  },
];
