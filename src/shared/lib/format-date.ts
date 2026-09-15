import { format, isValid, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";

const DISPLAY_PATTERN = "EEE, MMM d, yy";

/**
 * Format a calendar date for UI display: "Fri, Aug 15, 26".
 * Date-only strings (YYYY-MM-DD) are parsed as local calendar days
 * so UTC midnight does not shift the weekday/day.
 */
export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "-";

  const trimmed = value.trim();
  if (!trimmed) return "-";

  const date = parseISO(trimmed);
  if (!isValid(date)) return trimmed;

  return format(date, DISPLAY_PATTERN, { locale: enUS });
}

/**
 * Compact calendar date for dense tables: "Mar 3, 26".
 */
export function formatShortDisplayDate(
  value: string | null | undefined,
): string {
  if (!value) return "-";

  const trimmed = value.trim();
  if (!trimmed) return "-";

  const date = parseISO(trimmed);
  if (!isValid(date)) return trimmed;

  return format(date, "MMM d, yy", { locale: enUS });
}
