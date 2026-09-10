import {
  IconArrowsExchange,
  IconBuildingBank,
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
  IconChartAreaLine,
  IconFileUpload,
  IconLayoutBoard,
  IconDatabase,
  IconPuzzle,
};

export function resolveModuleIcon(name: string): Icon {
  return ICON_MAP[name] ?? IconPuzzle;
}
