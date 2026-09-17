export const PING_TYPES = ["Toast", "Email", "Popup", "Banner"] as const;
export type PingType = (typeof PING_TYPES)[number];

export function normalizePingTypes(types: readonly string[]): PingType[] {
  return PING_TYPES.filter((type) => types.includes(type));
}

export function togglePingType(
  selected: readonly PingType[],
  type: PingType,
): PingType[] {
  if (selected.includes(type)) {
    const next = selected.filter((item) => item !== type);
    return next.length > 0 ? next : [...selected];
  }
  return normalizePingTypes([...selected, type]);
}

export const CYCLE_MODES = ["Weekly", "Monthly", "EOM", "SOM"] as const;
export const CYCLE_WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
export const CYCLE_PRESETS = [...CYCLE_MODES, ...CYCLE_WEEKDAYS] as const;

export type CycleMode = (typeof CYCLE_MODES)[number];
export type CycleWeekday = (typeof CYCLE_WEEKDAYS)[number];
export type CyclePreset = (typeof CYCLE_PRESETS)[number];

const CYCLE_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;

function cycleTokens(cycle: string): string[] {
  return cycle
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function isCyclePresetToken(token: string): token is CyclePreset {
  return (CYCLE_PRESETS as readonly string[]).includes(token);
}

function isCycleDateToken(token: string): boolean {
  return CYCLE_DATE_PATTERN.test(token);
}

export function isCycleDateValue(cycle: string): boolean {
  return cycleTokens(cycle).some((token) => isCycleDateToken(token));
}

export function isoToCycleDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) {
    return "";
  }
  return `${Number(month)}/${Number(day)}/${year.slice(-2)}`;
}

export function cycleDateToIso(cycle: string): string {
  const token = cycleTokens(cycle).find((part) => isCycleDateToken(part));
  if (!token) {
    return "";
  }
  const match = token.match(CYCLE_DATE_PATTERN);
  if (!match) {
    return "";
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const yearPart = match[3];
  const year = yearPart
    ? yearPart.length === 2
      ? 2000 + Number(yearPart)
      : Number(yearPart)
    : new Date().getFullYear();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function serializeCycle(tokens: readonly string[]): string {
  const extras = tokens.filter((token) => !isCyclePresetToken(token));
  const presets = CYCLE_PRESETS.filter((preset) => tokens.includes(preset));
  return [...presets, ...extras].join(",");
}

export function isCyclePresetOn(cycle: string, preset: CyclePreset): boolean {
  return cycleTokens(cycle).includes(preset);
}

export function toggleCyclePreset(cycle: string, preset: CyclePreset): string {
  const tokens = cycleTokens(cycle);
  const next = tokens.includes(preset)
    ? tokens.filter((token) => token !== preset)
    : [...tokens, preset];
  return serializeCycle(next);
}

export function applyCycleDate(cycle: string, iso: string): string {
  const date = isoToCycleDate(iso);
  if (!date) {
    return cycle;
  }
  const kept = cycleTokens(cycle).filter((token) => !isCycleDateToken(token));
  return serializeCycle([...kept, date]);
}
