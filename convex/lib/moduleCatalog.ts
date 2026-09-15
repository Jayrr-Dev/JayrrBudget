/** Full product module catalog (metadata). Access per role lives in `roles.ts`. */

export type ModuleCatalogEntry = {
  slug: string;
  name: string;
  description: string;
  href: string;
  icon: string;
  category: "core" | "finance" | "system";
  sortOrder: number;
  isCore: boolean;
};

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  {
    slug: "overview",
    name: "Overview",
    description: "Bank-style balances by account category.",
    href: "/",
    icon: "IconLayoutDashboard",
    category: "core",
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
    sortOrder: 20,
    isCore: false,
  },
  {
    slug: "merchants",
    name: "Merchants",
    description: "Normalized merchant book linked to ledger rows.",
    href: "/merchants",
    icon: "IconBuildingStore",
    category: "finance",
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
    sortOrder: 35,
    isCore: false,
  },
  {
    slug: "transactions",
    name: "Transactions",
    description: "Ledger lines from statements and imports.",
    href: "/transactions",
    icon: "IconArrowsExchange",
    category: "finance",
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
    sortOrder: 50,
    isCore: false,
  },
  {
    slug: "issues",
    name: "Issues",
    description: "Report problems and review filed issues.",
    href: "/issues",
    icon: "IconBug",
    category: "system",
    sortOrder: 85,
    isCore: false,
  },
  {
    slug: "database",
    name: "Database",
    description: "Schema map and live table browser.",
    href: "/database",
    icon: "IconDatabase",
    category: "system",
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
    sortOrder: 100,
    isCore: true,
  },
] as const;
