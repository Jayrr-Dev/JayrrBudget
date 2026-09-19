import { CYCLE_WEEKDAYS, isNoneCycle, type CycleWeekday } from "@/domains/piggy-pings/domain/types";
import { addDays, differenceInCalendarDays } from "date-fns";

const CYCLE_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const WEEKDAY_INDEX: Record<CycleWeekday, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type NextPingDate =
  | { kind: "date"; ymd: string }
  | { kind: "trigger" }
  | { kind: "none" }
  | { kind: "ended" };

export type NextPingInput = {
  cycle: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: number;
};

/**
 * First upcoming fire on or after today.
 *
 * Weekly / Monthly without a start date use createdAt only as the
 * weekday / day-of-month anchor. That create day is not itself a fire,
 * so a monthly ping made today next lands next month, not today.
 *
 * An explicit start date can fire on that day.
 */
export function resolveNextPingDate(
  input: NextPingInput,
  now = new Date(),
): NextPingDate {
  if (isNoneCycle(input.cycle)) return { kind: "none" };

  const today = startOfLocalDay(now);
  const start = parseYmd(input.startDate);
  const end = parseYmd(input.endDate);
  const createdDay = startOfLocalDay(new Date(input.createdAt));
  const from = firstSearchDay(start, today);
  if (isAfterEnd(from, end)) return { kind: "ended" };

  const anchor = start ?? createdDay;
  const implicitStart = start === null;
  const candidates = cycleTokens(input.cycle)
    .map((token) => nextForToken(token, anchor, from, implicitStart))
    .filter((date): date is Date => date !== null)
    .filter((date) => isOnOrBeforeEnd(date, end));

  const earliest = candidates.reduce<Date | null>((soonest, date) => {
    if (!soonest) return date;
    if (date.getTime() < soonest.getTime()) return date;
    return soonest;
  }, null);

  if (!earliest) {
    if (isAfterEnd(today, end)) return { kind: "ended" };
    return { kind: "none" };
  }
  return { kind: "date", ymd: toLocalYmd(earliest) };
}

export function toLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstSearchDay(start: Date | null, today: Date): Date {
  if (!start) return today;
  if (start.getTime() > today.getTime()) return start;
  return today;
}

function isAfterEnd(date: Date, end: Date | null): boolean {
  if (!end) return false;
  return date.getTime() > end.getTime();
}

function isOnOrBeforeEnd(date: Date, end: Date | null): boolean {
  if (!end) return true;
  return date.getTime() <= end.getTime();
}

function cycleTokens(cycle: string): string[] {
  return cycle
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isAnchoredRepeat(token: string): boolean {
  return token === "Weekly" || token === "Monthly";
}

function nextForToken(
  token: string,
  anchor: Date,
  from: Date,
  implicitStart: boolean,
): Date | null {
  const search = implicitSearchDay(token, anchor, from, implicitStart);
  if (token === "Weekly") return nextWeekly(anchor, search);
  if (token === "Monthly") return nextMonthly(anchor, search);
  if (token === "EOM") return nextEom(search);
  if (token === "SOM") return nextSom(search);
  if (isWeekday(token)) return nextWeekday(token, search);
  return nextCalendarToken(token, search);
}

/** Skip the create day for Weekly/Monthly when start was left open. */
function implicitSearchDay(
  token: string,
  anchor: Date,
  from: Date,
  implicitStart: boolean,
): Date {
  if (!implicitStart) return from;
  if (!isAnchoredRepeat(token)) return from;
  const afterCreate = addDays(anchor, 1);
  if (from.getTime() < afterCreate.getTime()) return afterCreate;
  return from;
}

function nextWeekly(anchor: Date, from: Date): Date {
  if (from.getTime() < anchor.getTime()) return anchor;
  const elapsed = differenceInCalendarDays(from, anchor);
  const remainder = elapsed % 7;
  if (remainder === 0) return from;
  return addDays(from, 7 - remainder);
}

function nextMonthly(anchor: Date, from: Date): Date {
  if (from.getTime() < anchor.getTime()) return anchor;
  const day = anchor.getDate();
  let year = from.getFullYear();
  let month = from.getMonth();
  let candidate = monthDate(year, month, day);
  if (candidate.getTime() < from.getTime()) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = monthDate(year, month, day);
  }
  return candidate;
}

function nextEom(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 0);
}

function nextSom(from: Date): Date {
  if (from.getDate() === 1) return from;
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

function nextWeekday(token: CycleWeekday, from: Date): Date {
  const delta = (WEEKDAY_INDEX[token] - from.getDay() + 7) % 7;
  return addDays(from, delta);
}

function nextCalendarToken(token: string, from: Date): Date | null {
  const match = token.match(CYCLE_DATE_PATTERN);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const yearPart = match[3];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (!yearPart) return nextYearly(month, day, from);
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  const candidate = exactDate(year, month - 1, day);
  if (!candidate) return null;
  if (candidate.getTime() < from.getTime()) return null;
  return candidate;
}

function nextYearly(month: number, day: number, from: Date): Date {
  const year = from.getFullYear();
  let candidate = monthDate(year, month - 1, day);
  if (candidate.getTime() < from.getTime()) {
    candidate = monthDate(year + 1, month - 1, day);
  }
  return candidate;
}

function isWeekday(token: string): token is CycleWeekday {
  return (CYCLE_WEEKDAYS as readonly string[]).includes(token);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseYmd(value: string | null): Date | null {
  const match = YMD.exec(value?.trim() ?? "");
  if (!match) return null;
  return exactDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function exactDate(year: number, monthIndex: number, day: number): Date | null {
  const date = new Date(year, monthIndex, day);
  if (date.getFullYear() !== year) return null;
  if (date.getMonth() !== monthIndex) return null;
  if (date.getDate() !== day) return null;
  return date;
}

function monthDate(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const clamped = day > last ? last : day;
  return new Date(year, monthIndex, clamped);
}
