import {
  triggerHasOver,
  triggerHasWarn,
} from "@/domains/piggy-pings/domain/budgetPingTrigger";

export type PingToastTone = "warn" | "over" | "default";

export function pingToastTone(input: {
  title?: string;
  message?: string;
  trigger?: string | null;
  event?: "warn" | "over";
}): PingToastTone {
  if (input.event === "over") return "over";
  if (input.event === "warn") return "warn";
  if (triggerHasOver(input.trigger)) return "over";
  if (triggerHasWarn(input.trigger)) return "warn";
  const text = `${input.title ?? ""} ${input.message ?? ""}`.toLowerCase();
  if (text.includes("overage") || text.includes("went over")) return "over";
  if (text.includes("warning")) return "warn";
  return "default";
}
