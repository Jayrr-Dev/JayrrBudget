/**
 * One name per real-world bucket. AI kept inventing twins
 * (Loan Payments vs Loans, Remittance vs Money Transfers).
 */

export const CANONICAL_CATEGORIES = [
  "Food and Drink",
  "Shopping",
  "Entertainment",
  "Software and Subscriptions",
  "Personal Care",
  "Utilities",
  "Rent and Housing",
  "Fuel",
  "Rideshare and Transit",
  "Travel",
  "Auto",
  "Medical",
  "Insurance",
  "Loans",
  "Bank Fees",
  "Money Transfers",
  "Account Transfers",
  "Cash and ATM",
  "Investments",
  "Employment Income",
  "Rewards",
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

/** Lowercase alias → canonical display name. */
const ALIASES: Record<string, CanonicalCategory> = {
  "food and drink": "Food and Drink",
  "food_and_drink": "Food and Drink",
  restaurants: "Food and Drink",
  groceries: "Food and Drink",
  shopping: "Shopping",
  "general merchandise": "Shopping",
  "online retail": "Shopping",
  entertainment: "Entertainment",
  "software and subscriptions": "Software and Subscriptions",
  saas: "Software and Subscriptions",
  "personal care": "Personal Care",
  utilities: "Utilities",
  "rent and housing": "Rent and Housing",
  fuel: "Fuel",
  "gas stations": "Fuel",
  "rideshare and transit": "Rideshare and Transit",
  rideshare: "Rideshare and Transit",
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
  "money transfers": "Money Transfers",
  remittance: "Money Transfers",
  "p2p transfers": "Money Transfers",
  "e-transfer": "Money Transfers",
  "account transfers": "Account Transfers",
  "bank transfers": "Account Transfers",
  "internal transfers": "Account Transfers",
  "credit card payment": "Account Transfers",
  "cash and atm": "Cash and ATM",
  "atm withdrawal": "Cash and ATM",
  "cash advance": "Cash and ATM",
  investments: "Investments",
  "employment income": "Employment Income",
  "salary and wages": "Employment Income",
  payroll: "Employment Income",
  rewards: "Rewards",
  "rewards and cashback": "Rewards",
  "rewards and rebates": "Rewards",
  cashback: "Rewards",
};

function key(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function canonicalCategoryName(name: string | null | undefined): string {
  if (!name?.trim()) return "Uncategorized";
  const alias = ALIASES[key(name)] ?? ALIASES[name.trim().toLowerCase()];
  if (alias) return alias;
  return name.trim();
}

/** Prompt block for parse / enrich / QA models. */
export function canonicalCategoryAiRules() {
  return [
    "CANONICAL CATEGORIES — reuse these exact names. Do not invent a near-duplicate.",
    ...CANONICAL_CATEGORIES.map((name) => `- ${name}`),
    "",
    "MERGE RULES (never split these):",
    "- Loans = Loan Payments, Student Loans, BNPL, LOC principal PAD. One bucket.",
    "- Money Transfers = e-Transfer to/from a person, remittance, GLOBAL MONEY TRANSFER, P2P. Money left the household.",
    "- Account Transfers = INTERNET TRANSFER between own CIBC accounts, PAYMENT THANK YOU / card payoff, internal move. Not spending.",
    "- Travel = Airlines + hotels. Auto = dealers, service, parts. Fuel stays Fuel. Rideshare stays Rideshare and Transit.",
    "- Employment Income = Salary and Wages, payroll, PAY UTILITEK. Rewards = cashback / remise en argent.",
    "- Bank Fees = interest charged, account fees. Not card payoffs.",
    "- Refunds of purchases keep the original spend category (Shopping etc.), transactionCode refund. Never Income.",
    "",
    "DO NOT CREATE: Loan Payments, Student Loans, Remittance, Airlines, Automotive, Auto Dealers and Services, Salary and Wages, Rewards and Cashback, Bank Transfers, International Transfers as categories.",
  ].join("\n");
}
