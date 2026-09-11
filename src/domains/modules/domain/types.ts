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
    description: "Bank-style balances by account category.",
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
    description: "Spending and cost trends over time.",
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
    description: "Linked and statement accounts.",
    href: "/accounts",
    icon: "IconBuildingBank",
    category: "finance",
    enabled: true,
    sortOrder: 20,
    isCore: false,
  },
  {
    slug: "transactions",
    name: "Transactions",
    description: "Ledger with merchant enrichment.",
    href: "/transactions",
    icon: "IconArrowsExchange",
    category: "finance",
    enabled: true,
    sortOrder: 30,
    isCore: false,
  },
  {
    slug: "statements",
    name: "Statements",
    description: "Import PDFs, overview stats, and parse logs.",
    href: "/statements",
    icon: "IconFileUpload",
    category: "finance",
    enabled: true,
    sortOrder: 40,
    isCore: false,
  },
  {
    slug: "canvas",
    name: "Canvas",
    description: "Budget canvas workspace.",
    href: "/canvas",
    icon: "IconLayoutBoard",
    category: "core",
    enabled: true,
    sortOrder: 50,
    isCore: false,
  },
  {
    slug: "database",
    name: "Database",
    description: "Schema map and live table browser.",
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
    description: "Enable or disable product modules.",
    href: "/modules",
    icon: "IconPuzzle",
    category: "system",
    enabled: true,
    sortOrder: 100,
    isCore: true,
  },
];
