export function budgetPingTrigger(
  name: string,
  warn: boolean,
  over: boolean,
) {
  const label = name.trim();
  if (warn && over) return `${label} + Warn + Over`;
  if (over) return `${label} + Over`;
  return `${label} + Warn`;
}
