import { PiggyIcon, type PiggyIconName } from "@/components/ui/piggy-icon";
import type { ComponentType } from "react";

const ICON_NAMES: Record<string, PiggyIconName> = {
  IconLayoutDashboard: "overview",
  IconBuildingBank: "accounts",
  IconArrowsExchange: "transactions",
  IconBuildingStore: "merchants",
  IconCategory: "classifications",
  IconChartAreaLine: "analysis",
  IconFileUpload: "statements",
  IconLayoutBoard: "canvas",
  IconBug: "issues",
  IconDatabase: "database",
  IconPuzzle: "modules",
  IconServerCog: "service",
  IconUsers: "users",
  IconCurrencyDollar: "revenue",
};

type ModuleIcon = ComponentType<{ className?: string }>;
// Stable component identities keep navigation icons mounted during updates.
const ICON_MAP = Object.fromEntries(Object.entries(ICON_NAMES).map(([key, name]) => {
  function ModuleArtwork({ className }: { className?: string }) {
    return <PiggyIcon name={name} className={className} />;
  }
  return [key, ModuleArtwork];
})) as Record<string, ModuleIcon>;

export function resolveModuleIcon(name: string): ModuleIcon {
  return ICON_MAP[name] ?? ICON_MAP.IconPuzzle;
}
