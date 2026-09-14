import type { AnalysisPeriod, AnalysisRange } from "@/domains/analysis/domain/types";

/** Monday 2018-01-01. Biweekly windows count forward from this day. */
const BIWEEK_EPOCH_UTC = Date.UTC(2018, 0, 1);
const DAY_MS = 86_400_000;

/** Toggle options for time series Monthly / Biweekly / Weekly / Daily views. */
export const ANALYSIS_PERIOD_OPTIONS: {
  value: AnalysisPeriod;
  label: string;
}[] = [
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily" },
];

/** Copy for avg/peak stats and chart info that follow the selected period. */
export const ANALYSIS_PERIOD_META: Record<
  AnalysisPeriod,
  {
    label: string;
    noun: string;
    nounPlural: string;
    avgLabel: string;
    peakLabel: string;
    txnRateLabel: string;
    incomeRateLabel: string;
    avgCostLabel: string;
    avgCountLabel: string;
  }
> = {
  monthly: {
    label: "Monthly",
    noun: "month",
    nounPlural: "months",
    avgLabel: "Avg monthly spend",
    peakLabel: "Peak month",
    txnRateLabel: "Transactions / month",
    incomeRateLabel: "Income / month",
    avgCostLabel: "Avg cost / month",
    avgCountLabel: "Avg count / month",
  },
  biweekly: {
    label: "Biweekly",
    noun: "2-week period",
    nounPlural: "2-week periods",
    avgLabel: "Avg biweekly spend",
    peakLabel: "Peak 2 weeks",
    txnRateLabel: "Transactions / 2 weeks",
    incomeRateLabel: "Income / 2 weeks",
    avgCostLabel: "Avg cost / 2 weeks",
    avgCountLabel: "Avg count / 2 weeks",
  },
  weekly: {
    label: "Weekly",
    noun: "week",
    nounPlural: "weeks",
    avgLabel: "Avg weekly spend",
    peakLabel: "Peak week",
    txnRateLabel: "Transactions / week",
    incomeRateLabel: "Income / week",
    avgCostLabel: "Avg cost / week",
    avgCountLabel: "Avg count / week",
  },
  daily: {
    label: "Daily",
    noun: "day",
    nounPlural: "days",
    avgLabel: "Avg daily spend",
    peakLabel: "Peak day",
    txnRateLabel: "Transactions / day",
    incomeRateLabel: "Income / day",
    avgCostLabel: "Avg cost / day",
    avgCountLabel: "Avg count / day",
  },
};

function parseUtcDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function formatUtcDate(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add calendar days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, delta: number) {
  const date = parseUtcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + delta);
  return formatUtcDate(date);
}

/** YYYY-MM bucket for a posted date. */
export function monthKey(isoDate: string) {
  return isoDate.slice(0, 7);
}

/** Shift a YYYY-MM key by whole months. */
export function addMonths(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthsBetween(start: string, end: string) {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
    if (out.length > 240) break;
  }
  return out;
}

function startOfUtcWeek(isoDate: string) {
  const date = parseUtcDate(isoDate);
  const dow = date.getUTCDay();
  const shift = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + shift);
  return formatUtcDate(date);
}

function startOfUtcBiweek(isoDate: string) {
  const weekStart = startOfUtcWeek(isoDate);
  const utc = parseUtcDate(weekStart).getTime();
  const days = Math.round((utc - BIWEEK_EPOCH_UTC) / DAY_MS);
  const start = new Date(
    BIWEEK_EPOCH_UTC + Math.floor(days / 14) * 14 * DAY_MS,
  );
  return formatUtcDate(start);
}

function shortUtc(isoDate: string, withYear: boolean) {
  const date = parseUtcDate(isoDate);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function rangeLabel(start: string, end: string) {
  const startDate = parseUtcDate(start);
  const endDate = parseUtcDate(end);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const sameMonth =
    sameYear && startDate.getUTCMonth() === endDate.getUTCMonth();
  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(startDate);
    return `${month} ${startDate.getUTCDate()}-${endDate.getUTCDate()}, ${startDate.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${shortUtc(start, false)}-${shortUtc(end, true)}`;
  }
  return `${shortUtc(start, true)}-${shortUtc(end, true)}`;
}

/**
 * Stable bucket key for a posted date.
 * Monthly is YYYY-MM. Daily is YYYY-MM-DD.
 * Weekly and biweekly are the Monday that starts the window.
 */
export function periodKey(isoDate: string, period: AnalysisPeriod) {
  if (period === "monthly") return monthKey(isoDate);
  if (period === "daily") return isoDate.slice(0, 10);
  if (period === "weekly") return startOfUtcWeek(isoDate);
  return startOfUtcBiweek(isoDate);
}

/** Axis / table label for a period key. */
export function periodLabel(key: string, period: AnalysisPeriod) {
  if (period === "monthly") return monthLabel(key);
  if (period === "daily") return shortUtc(key, true);
  if (period === "weekly") return rangeLabel(key, addDays(key, 6));
  return rangeLabel(key, addDays(key, 13));
}

/** Inclusive list of period keys from start date through end date. */
export function periodsBetween(
  startIso: string,
  endIso: string,
  period: AnalysisPeriod,
) {
  if (period === "monthly") {
    return monthsBetween(monthKey(startIso), monthKey(endIso));
  }
  const step = period === "daily" ? 1 : period === "weekly" ? 7 : 14;
  const cap = period === "daily" ? 1500 : 520;
  let cursor = startIso.slice(0, 10);
  let last = endIso.slice(0, 10);
  if (period === "weekly") {
    cursor = startOfUtcWeek(startIso);
    last = startOfUtcWeek(endIso);
  } else if (period === "biweekly") {
    cursor = startOfUtcBiweek(startIso);
    last = startOfUtcBiweek(endIso);
  }
  const out: string[] = [];
  while (cursor <= last) {
    out.push(cursor);
    cursor = addDays(cursor, step);
    if (out.length > cap) break;
  }
  return out;
}

/** Parse `?period=` or fall back to monthly. */
export function parseAnalysisPeriod(value: string | null): AnalysisPeriod {
  if (
    value === "monthly" ||
    value === "biweekly" ||
    value === "weekly" ||
    value === "daily"
  ) {
    return value;
  }
  return "monthly";
}

/** Parse `?range=` or fall back to 12m. */
export function parseAnalysisRange(
  value: string | null | undefined,
): AnalysisRange {
  const allowed = ["1w", "1m", "3m", "6m", "12m", "all"] as const;
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as AnalysisRange;
  }
  return "12m";
}
