import { format, isValid, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";

const DISPLAY_PATTERN = "EEE, MMM d, yy";
const LONG_DISPLAY_PATTERN = "EEEE, MMMM d, yyyy";

function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymd) {
    const date = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if (!isValid(date)) return null;
    return date;
  }

  const date = parseISO(trimmed);
  if (!isValid(date)) return null;

  return date;
}

/**
 * Format a calendar date for UI display: "Fri, Sep 3, 26".
 * Date-only strings (YYYY-MM-DD) are parsed as local calendar days
 * so UTC midnight does not shift the day.
 */
export function formatDisplayDate(value: string | null | undefined): string {
  const date = parseCalendarDate(value);
  if (!date) {
    const trimmed = value?.trim();
    return trimmed || "-";
  }

  return format(date, DISPLAY_PATTERN);
}

/**
 * Weekday-forward calendar date: "Friday, September 6, 2023".
 */
export function formatLongDisplayDate(
  value: string | null | undefined,
): string {
  const date = parseCalendarDate(value);
  if (!date) {
    const trimmed = value?.trim();
    return trimmed || "-";
  }

  return format(date, LONG_DISPLAY_PATTERN, { locale: enUS });
}

/**
 * Compact calendar date for dense tables (same numeric short form).
 */
export function formatShortDisplayDate(
  value: string | null | undefined,
): string {
  return formatDisplayDate(value);
}
