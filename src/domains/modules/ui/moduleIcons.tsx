import { PiggyIcon, type PiggyIconName } from "@/components/ui/piggy-icon";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

const ICON_NAMES: Record<string, PiggyIconName> = {
  IconLayoutDashboard: "overview",
  IconBuildingBank: "accounts",
  IconArrowsExchange: "transactions",
  IconBuildingStore: "merchants",
  IconCategory: "classifications",
  IconChartAreaLine: "analysis",
  IconWallet: "budgets",
  IconFileUpload: "statements",
  IconLayoutBoard: "canvas",
  IconBell: "pings",
  IconBug: "issues",
  IconDatabase: "database",
  IconPuzzle: "modules",
  IconServerCog: "service",
  IconUsers: "users",
  IconCurrencyDollar: "revenue",
};

type ModuleIcon = ComponentType<{ className?: string }>;

function ModuleArtwork({
  name,
  className,
}: {
  name: PiggyIconName;
  className?: string;
}) {
  if (name === "pings") {
    return (
      <span className="relative inline-flex size-5 shrink-0">
        <PiggyIcon name="pings" className={cn("size-5", className)} />
        <span
          className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500 ring-2 ring-sidebar"
          aria-hidden
        />
      </span>
    );
  }
  return <PiggyIcon name={name} className={className} />;
}

const ICON_MAP = Object.fromEntries(
  Object.entries(ICON_NAMES).map(([key, name]) => {
    function Artwork({ className }: { className?: string }) {
      return <ModuleArtwork name={name} className={className} />;
    }
    return [key, Artwork];
  }),
) as Record<string, ModuleIcon>;

export function resolveModuleIcon(name: string): ModuleIcon {
  return ICON_MAP[name] ?? ICON_MAP.IconPuzzle;
}
