import {
  IconArrowsExchange,
  IconBug,
  IconBuildingBank,
  IconBuildingStore,
  IconCategory,
  IconChartAreaLine,
  IconDatabase,
  IconFileUpload,
  IconLayoutBoard,
  IconLayoutDashboard,
  IconPuzzle,
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
};

export function resolveModuleIcon(name: string): Icon {
  return ICON_MAP[name] ?? IconPuzzle;
}
