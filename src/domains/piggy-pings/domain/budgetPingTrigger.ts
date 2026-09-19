export function budgetWarnTrigger(name: string) {
  return `${name.trim()} + Warn`;
}

export function budgetOverTrigger(name: string) {
  return `${name.trim()} + Over`;
}

export function budgetWarnOverTrigger(name: string) {
  return `${name.trim()} + Warn + Over`;
}

export function uniqueBudgetNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

const TRIGGER_SUFFIX = /\s*\+\s*(?:Warn(?:\s*\+\s*Over)?|Over)\s*$/i;

export function budgetNameFromTrigger(trigger: string | null | undefined) {
  const value = trigger?.trim() ?? "";
  if (!value) return "";
  return value.replace(TRIGGER_SUFFIX, "").trim() || value;
}

export function budgetPingTrigger(
  name: string,
  warn: boolean,
  over: boolean,
) {
  if (warn && over) return budgetWarnOverTrigger(name);
  if (over) return budgetOverTrigger(name);
  return budgetWarnTrigger(name);
}

export function triggerHasWarn(trigger: string | null | undefined) {
  const value = trigger?.toLowerCase() ?? "";
  return value.includes("+ warn");
}

export function triggerHasOver(trigger: string | null | undefined) {
  const value = trigger?.toLowerCase() ?? "";
  return value.includes("+ over") || value.endsWith(" over");
}

export function budgetPingFireKey(
  pingId: string,
  budgetId: string,
  periodStart: string,
  event: "warn" | "over",
) {
  return `${pingId}:${budgetId}:${periodStart}:${event}`;
}
