/**
 * One name per real-world bucket. Compound "X and Y" labels are split
 * into two categories; type/detailed hints pick the right half.
 */

export const CANONICAL_CATEGORIES = [
  "Food",
  "Drink",
  "Shopping",
  "Entertainment",
  "Software",
  "Subscriptions",
  "AI Services",
  "Software & Subscriptions",
  "Cloud & Hosting",
  "Personal Care",
  "Utilities",
  "Rent",
  "Housing",
  "Fuel",
  "Rideshare",
  "Transit",
  "Flights",
  "Travel",
  "Auto",
  "Medical",
  "Insurance",
  "Loans",
  "Bank Fees",
  "Money Transfers",
  "Account Transfers",
  "Cash & ATM",
  "Investments",
  "Employment Income",
  "Employment",
  "Government Benefits",
  "Government & Tax",
  "Rewards",
  "Cashback & Rebates",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

type CompoundSplit = {
  left: CanonicalCategory;
  right: CanonicalCategory;
  /** When hint matches, use right; otherwise left. */
  rightHint: RegExp;
};

/** Legacy "X and Y" labels → two buckets. */
const COMPOUND_SPLITS: Record<string, CompoundSplit> = {
  "food and drink": {
    left: "Food",
    right: "Drink",
    rightHint:
      /coffee|cafe|caf[eé]|drink|beverage|alcohol|bar|pub|tea|juice|smoothie|liquor|wine|beer/i,
  },
  "software and subscriptions": {
    left: "Software",
    right: "Subscriptions",
    rightHint:
      /subscription|streaming|netflix|spotify|disney|crave|youtube\s*premium|prime\s*video/i,
  },
  "rent and housing": {
    left: "Rent",
    right: "Housing",
    rightHint:
      /housing|mortgage|property|condo|hoa|home\s*insurance|repairs?|maintenance/i,
  },
  "rideshare and transit": {
    left: "Rideshare",
    right: "Transit",
    rightHint:
      /transit|bus|metro|subway|ttc|go\s*train|via\s*rail|parking|fare|pass/i,
  },
};

/** Lowercase alias → canonical display name. */
const ALIASES: Record<string, CanonicalCategory> = {
  food: "Food",
  "food and drink": "Food",
  food_and_drink: "Food",
  restaurants: "Food",
  groceries: "Food",
  delivery: "Food",
  "fast food": "Food",
  drink: "Drink",
  coffee: "Drink",
  beverages: "Drink",
  shopping: "Shopping",
  "general merchandise": "Shopping",
  "online retail": "Shopping",
  entertainment: "Entertainment",
  software: "Software",
  "software and subscriptions": "Software",
  saas: "Software",
  "cloud software": "Software",
  "developer tools": "Software",
  subscriptions: "Subscriptions",
  subscription: "Subscriptions",
  "personal care": "Personal Care",
  utilities: "Utilities",
  rent: "Rent",
  "rent and housing": "Rent",
  housing: "Housing",
  fuel: "Fuel",
  "gas stations": "Fuel",
  rideshare: "Rideshare",
  "rideshare and transit": "Rideshare",
  transit: "Transit",
  travel: "Travel",
  airlines: "Travel",
  auto: "Auto",
  automotive: "Auto",
  "auto dealers and services": "Auto",
  medical: "Medical",
  pharmacies: "Medical",
  insurance: "Insurance",
  loans: "Loans",
  "loan payments": "Loans",
  "student loans": "Loans",
  "student loan": "Loans",
  "buy now pay later": "Loans",
  "bank fees": "Bank Fees",
  "interest charges": "Bank Fees",
  "money transfers": "External Transfers",
  remittance: "External Transfers",
  "external transfers": "External Transfers",
  "p2p transfers": "External Transfers",
  "e-transfer": "External Transfers",
  "interac e-transfer": "External Transfers",
  "account transfers": "Account Transfers",
  "bank transfers": "Account Transfers",
  "internal transfers": "Account Transfers",
  "self transfers": "Account Transfers",
  "credit card payment": "Account Transfers",
  "credit card payoffs": "Account Transfers",
  cash: "Cash & ATM",
  "cash and atm": "Cash & ATM",
  "cash & atm": "Cash & ATM",
  "cash advance": "Cash & ATM",
  atm: "Cash & ATM",
  "atm withdrawal": "Cash & ATM",
  investments: "Investments",
  "employment income": "Employment",
  employment: "Employment",
  "salary and wages": "Employment",
  payroll: "Employment",
  paycheck: "Employment",
  "government benefits": "Government & Tax",
  "government & tax": "Government & Tax",
  "tax benefits and credits": "Government & Tax",
  "tax refunds": "Government & Tax",
  "tax credits": "Government & Tax",
  "gst/hst credit": "Government & Tax",
  "tax refund": "Government & Tax",
  rewards: "Cashback & Rebates",
  "cashback & rebates": "Cashback & Rebates",
  "rewards and cashback": "Cashback & Rebates",
  "rewards and rebates": "Cashback & Rebates",
  cashback: "Cashback & Rebates",
  "general shopping": "Shopping",
  shopping: "Shopping",
  "software & subscriptions": "Software & Subscriptions",
  "cloud & hosting": "Cloud & Hosting",
  "ai services": "AI Services",
  "debt & loans": "Debt & Loans",
  loans: "Debt & Loans",
  "loan payments": "Debt & Loans",
  "bank fees": "Banking Fees",
  "banking fees": "Banking Fees",
  "medical care": "Medical",
  medical: "Medical",
  "auto care & expenses": "Auto Care & Expenses",
  auto: "Auto Care & Expenses",
  automotive: "Auto Care & Expenses",
  "auto dealers and services": "Dealership",
  dealership: "Dealership",
  rideshare: "Rideshare",
  "rideshare & transit": "Rideshare",
  "rideshare and transit": "Rideshare",
  transit: "Transit",
  "transit & flights": "Flights",
  "transit and flights": "Flights",
  flights: "Flights",
  "restaurants & cafes": "Restaurants & Cafes",
  "delivery services": "Delivery Services",
  "utilities & telecom": "Utilities & Telecom",
  utilities: "Utilities & Telecom",
  "home maintenance": "Home Maintenance",
  "home improvement": "Home Maintenance",
};

function key(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function pickCompoundSide(
  split: CompoundSplit,
  hint: string | null | undefined,
): CanonicalCategory {
  if (hint?.trim() && split.rightHint.test(hint)) return split.right;
  return split.left;
}

/**
 * Resolve a spend label to one canonical category.
 * Pass type / categoryDetailed as `hint` so "Food and Drink" can become Drink
 * when the type is Coffee, etc.
 */
export function canonicalCategoryName(
  name: string | null | undefined,
  hint?: string | null,
): string {
  if (!name?.trim()) return "Uncategorized";
  const normalized = key(name);

  const compound = COMPOUND_SPLITS[normalized];
  if (compound) {
    return pickCompoundSide(compound, hint);
  }

  const alias = ALIASES[normalized] ?? ALIASES[name.trim().toLowerCase()];
  if (alias) return alias;

  // Unknown "X and Y" → two vocabulary halves; txn lands on hint match or left.
  const andMatch = normalized.match(/^(.+?) and (.+)$/);
  if (andMatch) {
    const left = titleCaseWords(andMatch[1]);
    const right = titleCaseWords(andMatch[2]);
    if (hint?.trim()) {
      const h = key(hint);
      if (h.includes(andMatch[2]) || key(hint) === andMatch[2]) return right;
      if (h.includes(andMatch[1]) || key(hint) === andMatch[1]) return left;
    }
    return left;
  }

  return name.trim();
}

/** Prompt block for parse / enrich / QA models. */
export function canonicalCategoryAiRules() {
  return [
    "CANONICAL CATEGORIES — reuse these exact names. Do not invent a near-duplicate.",
    ...CANONICAL_CATEGORIES.map((name) => `- ${name}`),
    "",
    "SPLIT RULES (never keep 'X and Y' as one category):",
    "- Food vs Drink — restaurants/groceries/delivery = Food; coffee/cafe/alcohol/bars = Drink.",
    "- Software vs Subscriptions — SaaS/dev tools = Software; streaming/memberships = Subscriptions.",
    "- Rent vs Housing — rent PAD = Rent; mortgage/condo/repairs = Housing.",
    "- Rideshare vs Transit — Uber/Lyft/taxi = Rideshare; bus/metro/GO/parking fare = Transit.",
    "- Cash & ATM — cash advance and ATM withdrawal share one Transfers category.",
    "- Hair Salons vs Barbers — salon = Hair Salons type; barber = Barbers type. Both under Personal Care.",
    "",
    "MERGE RULES (never split these):",
    "- Loans = Loan Payments, Student Loans, BNPL, LOC principal PAD. One bucket.",
    "- Money Transfers = e-Transfer to/from a person, remittance, GLOBAL MONEY TRANSFER, P2P. Money left the household.",
    "- Account Transfers = INTERNET TRANSFER between own CIBC accounts, PAYMENT THANK YOU / card payoff, internal move. Not spending.",
    "- Cash & ATM = ATM withdrawals + cash advances. Do not keep separate Cash and ATM categories.",
    "- Travel = Airlines + hotels. Auto = dealers, service, parts. Fuel stays Fuel.",
    "- Employment Income = Salary and Wages, payroll, PAY UTILITEK. Rewards = cashback / remise en argent.",
    "- Government Benefits = GST/HST credit, tax credits, tax refunds, government benefit deposits.",
    "- Bank Fees = interest charged, account fees. Not card payoffs.",
    "- Refunds of purchases keep the original spend category (Shopping etc.), transactionCode refund. Never Income.",
    "",
    "DO NOT CREATE: Food and Drink, Software and Subscriptions, Rent and Housing, Rideshare and Transit, Cash, ATM, Hair Salons and Barbers, Loan Payments, Student Loans, Remittance, Airlines, Automotive, Auto Dealers and Services, Salary and Wages, Rewards and Cashback, Rewards and Rebates, Bank Transfers, Tax Benefits and Credits, Tax Refunds, International Transfers as categories.",
  ].join("\n");
}
