const MS_PER_DAY = 86_400_000;

/** UTC calendar day, e.g. 2026-09-16. */
export function utcDayKey(atMs: number) {
  const d = new Date(atMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** UTC midnight for the calendar day that contains `atMs`. */
export function utcDayStart(atMs: number) {
  const d = new Date(atMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Monday 00:00 UTC of the ISO-style week that contains `atMs`. */
export function utcWeekStart(atMs: number) {
  const dayStart = utcDayStart(atMs);
  const dow = new Date(dayStart).getUTCDay();
  const mondayOffset = (dow + 6) % 7;
  return dayStart - mondayOffset * MS_PER_DAY;
}

export function addUtcDays(dayStartMs: number, days: number) {
  return dayStartMs + days * MS_PER_DAY;
}

/** Shift a YYYY-MM key by `delta` months. */
export function shiftUtcMonthKey(monthKey: string, delta: number) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export { MS_PER_DAY };
