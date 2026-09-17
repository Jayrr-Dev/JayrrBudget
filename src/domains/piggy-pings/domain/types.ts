export const PING_TYPES = ["Toast", "Email", "Popup", "Banner"] as const;
export type PingType = (typeof PING_TYPES)[number];

export const CYCLE_PRESETS = [
  "Weekly",
  "Monthly",
  "EOM",
  "SOM",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

export type CyclePreset = (typeof CYCLE_PRESETS)[number];
