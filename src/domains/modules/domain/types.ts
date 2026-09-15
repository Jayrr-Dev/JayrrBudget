export type AppModuleRecord = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  href: string;
  icon: string;
  category: string;
  enabled: boolean;
  sortOrder: number;
  isCore: boolean;
};

export type SeedModule = {
  slug: string;
  name: string;
  description: string;
  href: string;
  icon: string;
  category: "core" | "finance" | "system";
  enabled: boolean;
  sortOrder: number;
  isCore: boolean;
};

export const SEED_MODULES: SeedModule[] = [
  {
    slug: "overview",
    name: "Overview",
    description: "See balances across your accounts.",
    href: "/",
    icon: "IconLayoutDashboard",
    category: "core",
    enabled: true,
    sortOrder: 10,
    isCore: true,
  },
  {
    slug: "analysis",
    name: "Analysis",
    description: "Charts of spending over time.",
    href: "/analysis",
    icon: "IconChartAreaLine",
    category: "finance",
    enabled: true,
    sortOrder: 15,
    isCore: false,
  },
  {
    slug: "accounts",
    name: "Accounts",
    description: "Open an account to see balance and activity.",
    href: "/accounts",
    icon: "IconBuildingBank",
    category: "finance",
    enabled: true,
    sortOrder: 20,
    isCore: false,
  },
  {
    slug: "merchants",
    name: "Merchants",
    description: "Fix store and payee names in one place.",
    href: "/merchants",
    icon: "IconBuildingStore",
    category: "finance",
    enabled: true,
    sortOrder: 30,
    isCore: false,
  },
  {
    slug: "statements",
    name: "Statements",
    description: "Upload bank PDFs and check imports.",
    href: "/statements",
    icon: "IconFileUpload",
    category: "finance",
    enabled: true,
    sortOrder: 35,
    isCore: false,
  },
  {
    slug: "transactions",
    name: "Transactions",
    description: "Browse and edit purchases and deposits.",
    href: "/transactions",
    icon: "IconArrowsExchange",
    category: "finance",
    enabled: true,
    sortOrder: 40,
    isCore: false,
  },
  {
    slug: "canvas",
    name: "Canvas",
    description: "Sketch budget ideas on a board.",
    href: "/canvas",
    icon: "IconLayoutBoard",
    category: "core",
    enabled: true,
    sortOrder: 50,
    isCore: false,
  },
  {
    slug: "issues",
    name: "Issues",
    description: "Report problems and review them.",
    href: "/issues",
    icon: "IconBug",
    category: "system",
    enabled: true,
    sortOrder: 85,
    isCore: false,
  },
  {
    slug: "database",
    name: "Database",
    description: "Browse tables and their rows.",
    href: "/database",
    icon: "IconDatabase",
    category: "system",
    enabled: true,
    sortOrder: 90,
    isCore: false,
  },
  {
    slug: "modules",
    name: "Modules",
    description: "Turn app features on or off.",
    href: "/modules",
    icon: "IconPuzzle",
    category: "system",
    enabled: true,
    sortOrder: 100,
    isCore: true,
  },
];
