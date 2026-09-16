import {
  IconArrowsExchange,
  IconBug,
  IconBuildingBank,
  IconBuildingStore,
  IconCategory,
  IconChartAreaLine,
  IconCurrencyDollar,
  IconDatabase,
  IconFileUpload,
  IconLayoutBoard,
  IconLayoutDashboard,
  IconPuzzle,
  IconServerCog,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";

const ICON_MAP: Record<string, Icon> = {
  IconLayoutDashboard,
  IconBuildingBank,
  IconArrowsExchange,
  IconBuildingStore,
  IconCategory,
  IconChartAreaLine,
  IconFileUpload,
  IconLayoutBoard,
  IconBug,
  IconDatabase,
  IconPuzzle,
  IconServerCog,
  IconUsers,
  IconCurrencyDollar,
};

export function resolveModuleIcon(name: string): Icon {
  return ICON_MAP[name] ?? IconPuzzle;
}
