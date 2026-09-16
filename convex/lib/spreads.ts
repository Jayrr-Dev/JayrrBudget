/**
 * Cash-flow Spread - Income plus 50/30/20 spend buckets.
 * Needs 50% · Wants 30% · Savings 20% of net pay.
 */

export const SPREAD_NAMES = ["Income", "Needs", "Wants", "Savings"] as const;
export type SpreadName = (typeof SPREAD_NAMES)[number];

export type SpreadDefinition = {
  name: SpreadName;
  /** Target share of net pay; 0 for Income (not a spend target). */
  targetPercent: 0 | 50 | 30 | 20;
  description: string;
  sortOrder: number;
};

export const SPREAD_DEFINITIONS: readonly SpreadDefinition[] = [
  {
    name: "Income",
    targetPercent: 0,
    description:
      "Payroll, cashback, and other real inflows (not card payoffs).",
    sortOrder: 0,
  },
  {
    name: "Needs",
    targetPercent: 50,
    description:
      "Rent/mortgage, utilities, groceries, insurance, car payments, and minimum debt payments.",
    sortOrder: 1,
  },
  {
    name: "Wants",
    targetPercent: 30,
    description:
      "Dining out, hobbies, subscriptions (Netflix/Spotify), shopping, and travel.",
    sortOrder: 2,
  },
  {
    name: "Savings",
    targetPercent: 20,
    description:
      "Emergency funds, retirement accounts, investments, or extra debt payoff.",
    sortOrder: 3,
  },
] as const;

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

const NEED_SUBCATEGORIES = new Set([
  "supermarkets",
  "supermarket",
  "produce",
  "meal kits",
  "fuel",
  "parking",
  "maintenance",
  "car wash",
  "car insurance",
  "home insurance",
  "service & sales",
  "service",
  "public transit",
  "personal financing",
  "student loans",
  "bnpl",
  "payment protection",
  "property & auto insurance",
  "monthly fees",
  "overdraft & interest",
  "interest",
  "overdraft",
  "transfer fees",
  "prescriptions",
  "clinics & telehealth",
  "clinics",
  "pharmacies",
  "cellphone plan",
  "mobile",
  "veterinary",
]);

const NEED_CATEGORIES = new Set([
  "insurance",
  "debt & loans",
  "loans",
  "banking fees",
  "medical",
  "auto care & expenses",
  "auto",
  "transit",
  "dealership",
  "mobile & wireless",
  "utilities",
  "groceries",
]);

const SAVINGS_SUBCATEGORIES = new Set([
  "brokerage & crypto",
  "brokerage",
  "crypto",
]);
const SAVINGS_CATEGORIES = new Set(["investments"]);

const WANT_SUBCATEGORIES = new Set([
  "food delivery",
  "dine-in",
  "fast food",
  "restaurants",
  "board game cafes",
  "department & online stores",
  "online stores",
  "convenience",
  "hobbies",
  "apparel",
  "discount stores",
  "electronics",
  "pet supplies",
  "hardware & tools",
  "hardware",
  "supplements",
  "gym memberships",
  "barbers & salons",
  "barbers",
  "salons",
  "cosmetics",
  "hotels & vacation rentals",
  "video games & digital goods",
  "games",
  "streaming",
  "cinemas",
  "education & training",
  "courses",
  "museums and cultural",
  "museums",
  "sports",
  "pickleball",
  "golf",
  "theme parks",
  "tours",
  "rideshare",
  "airline tickets",
  "in-flight",
  "car rental",
  "productivity & creative",
  "productivity",
  "creative",
  "communication & social",
  "communication",
  "security & utilities",
  "security",
  "ai code editors & ides",
  "code editors",
  "ai assistants & chat",
  "assistants",
  "model apis & inference",
  "model apis",
  "domains & registrars",
  "domains",
  "infrastructure",
  "developer & payment platforms",
  "developer",
  "payments",
]);

const WANT_CATEGORIES = new Set([
  "shopping",
  "entertainment",
  "lodging",
  "recreational",
  "attractions & tours",
  "attractions",
  "delivery",
  "restaurants",
  "takeout",
  "specialty food",
  "drink",
  "alcohol",
  "rideshare",
  "flights",
  "vehicle",
  "software",
  "ai services",
  "cloud & hosting",
  "cloud",
  "personal care",
]);

const WANT_SECTIONS = new Set(["lifestyle", "technology"]);
const NEED_SECTIONS = new Set(["health", "finance", "transport"]);

/**
 * Classify a ledger row into Income / Needs / Wants / Savings.
 * Transfers are not Spreads (return null).
 */
export function classifySpread(input: {
  section?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): SpreadName | null {
  const section = norm(input.section);
  const category = norm(input.category);
  const subcategory = norm(input.subcategory);

  if (!section && !category && !subcategory) return null;
  if (section === "transfers") return null;
  if (section === "income") return "Income";

  if (
    SAVINGS_SUBCATEGORIES.has(subcategory) ||
    SAVINGS_CATEGORIES.has(category)
  ) {
    return "Savings";
  }
  if (NEED_SUBCATEGORIES.has(subcategory) || NEED_CATEGORIES.has(category)) {
    return "Needs";
  }
  if (WANT_SUBCATEGORIES.has(subcategory) || WANT_CATEGORIES.has(category)) {
    return "Wants";
  }
  if (NEED_SECTIONS.has(section)) return "Needs";
  if (WANT_SECTIONS.has(section)) return "Wants";
  return "Wants";
}
