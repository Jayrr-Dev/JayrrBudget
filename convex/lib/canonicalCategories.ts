/**
 * One name per real-world bucket. Compound "X and Y" labels are split
 * into two categories; type/detailed hints pick the right half.
 */

export const CANONICAL_CATEGORIES = [
  "Groceries",
  "Restaurants",
  "Takeout",
  "Delivery",
  "Specialty Food",
  "Drink",
  "Shopping",
  "Entertainment",
  "AI Services",
  "Software",
  "Cloud",
  "Personal Care",
  "Fitness",
  "Recreational",
  "Pets",
  "Education",
  "Books",
  "Childcare",
  "Kids",
  "Elder Support",
  "Gifts",
  "Career",
  "Business Services",
  "Alcohol",
  "Utilities",
  "Home Maintenance",
  "Furnishings",
  "Housing",
  "Lodging",
  "Fuel",
  "Rideshare",
  "Transit",
  "Flights",
  "Attractions",
  "Auto",
  "Dealership",
  "Vehicle Payments",
  "Rentals",
  "Medical",
  "Dental",
  "Vision",
  "Therapy",
  "Insurance",
  "Loans",
  "Tax Payments",
  "Devices",
  "Banking Fees",
  "External Transfers",
  "Account Transfers",
  "ATM",
  "Investments",
  "Employment",
  "Government Benefits",
  "Tax",
  "Cashback",
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
    left: "Groceries",
    right: "Drink",
    rightHint:
      /coffee|cafe|caf[eé]|drink|beverage|tea|juice|smoothie/i,
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
  food: "Groceries",
  "food and drink": "Groceries",
  food_and_drink: "Groceries",
  groceries: "Groceries",
  supermarket: "Groceries",
  restaurants: "Restaurants",
  "restaurants & cafes": "Restaurants",
  "fast food": "Restaurants",
  takeout: "Takeout",
  delivery: "Delivery",
  "delivery services": "Delivery",
  "specialty food": "Specialty Food",
  drink: "Drink",
  coffee: "Drink",
  beverages: "Drink",
  alcohol: "Alcohol",
  liquor: "Alcohol",
  "liquor store": "Alcohol",
  bar: "Entertainment",
  bars: "Entertainment",
  pub: "Entertainment",
  nightclub: "Entertainment",
  audible: "Books",
  kindle: "Books",
  bookstore: "Books",
  lcbo: "Alcohol",
  "beer store": "Alcohol",
  shopping: "Shopping",
  "general merchandise": "Shopping",
  "online retail": "Shopping",
  "general shopping": "Shopping",
  entertainment: "Entertainment",
  software: "Software",
  "software and subscriptions": "Software",
  "software & subscriptions": "Software",
  saas: "Software",
  "cloud software": "Software",
  "developer tools": "Software",
  "personal care": "Personal Care",
  pets: "Pets",
  veterinary: "Pets",
  education: "Education",
  "education & training": "Education",
  books: "Books",
  audiobook: "Books",
  audiobooks: "Books",
  "medical care": "Medical",
  rent: "Housing",
  "rent and housing": "Housing",
  housing: "Housing",
  lodging: "Lodging",
  fuel: "Fuel",
  "gas stations": "Fuel",
  rideshare: "Rideshare",
  "rideshare and transit": "Rideshare",
  "rideshare & transit": "Rideshare",
  transit: "Transit",
  travel: "Flights",
  airlines: "Flights",
  flights: "Flights",
  "transit & flights": "Flights",
  "transit and flights": "Flights",
  sightseeing: "Attractions",
  "attractions & tours": "Attractions",
  "attractions and tours": "Attractions",
  attractions: "Attractions",
  medical: "Medical",
  pharmacies: "Medical",
  insurance: "Insurance",
  "student loans": "Loans",
  "student loan": "Loans",
  "buy now pay later": "Loans",
  loans: "Loans",
  "loan payments": "Loans",
  "debt & loans": "Loans",
  "bank fees": "Banking Fees",
  "banking fees": "Banking Fees",
  "interest charges": "Banking Fees",
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
  cash: "ATM",
  "cash and atm": "ATM",
  "cash & atm": "ATM",
  "cash advance": "ATM",
  atm: "ATM",
  "atm withdrawal": "ATM",
  investments: "Investments",
  "employment income": "Employment",
  employment: "Employment",
  "salary and wages": "Employment",
  payroll: "Employment",
  paycheck: "Employment",
  "government benefits": "Government Benefits",
  "government & tax": "Tax",
  "tax benefits and credits": "Tax",
  "tax refunds": "Tax",
  "tax credits": "Tax",
  "gst/hst credit": "Tax",
  "tax refund": "Tax",
  tax: "Tax",
  rewards: "Cashback",
  "cashback & rebates": "Cashback",
  "rewards and cashback": "Cashback",
  "rewards and rebates": "Cashback",
  cashback: "Cashback",
  "cloud & hosting": "Cloud",
  cloud: "Cloud",
  "ai services": "AI Services",
  auto: "Auto",
  automotive: "Auto",
  "auto care & expenses": "Auto",
  "auto dealers and services": "Dealership",
  dealership: "Dealership",
  utilities: "Utilities",
  "utilities & telecom": "Utilities",
  "home maintenance": "Home Maintenance",
  "home improvement": "Home Maintenance",
  furnishings: "Furnishings",
  furniture: "Furnishings",
  fitness: "Fitness",
  recreational: "Recreational",
  recreation: "Recreational",
  golf: "Recreational",
  gym: "Personal Care",
  family: "Childcare",
  childcare: "Childcare",
  kids: "Kids",
  "elder support": "Elder Support",
  "gifts & giving": "Gifts",
  gifts: "Gifts",
  charity: "Gifts",
  career: "Career",
  "business services": "Business Services",
  dental: "Dental",
  vision: "Vision",
  therapy: "Therapy",
  counselling: "Therapy",
  "tax payments": "Tax Payments",
  "property tax": "Tax Payments",
  "income tax": "Tax Payments",
  devices: "Devices",
  computers: "Devices",
  phones: "Devices",
  "vehicle payments": "Vehicle Payments",
  "car payment": "Vehicle Payments",
  rentals: "Rentals",
  "car rental": "Rentals",
  lease: "Vehicle Payments",
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
    "SECTIONS (top bucket; pick one): Finance, Income, Transfers, Home, Food, Lifestyle, Development, Technology, Transport, Health, Travel, Family.",
    "- Travel = trip spend only: Flights, Lodging, Attractions. Not a tag. Not a category.",
    "- Daily Uber, fuel, transit, parking, and car upkeep stay Transport.",
    "- Family = Childcare, Kids, Elder Support, Pets. Daycare, kids clothing, PetSmart, and vet are Family.",
    "- Food = Groceries, Restaurants, Takeout, Delivery, Specialty Food, Drink, Alcohol. Food is a section, not a category.",
    "- Development = Education, Career, Books. Courses, tuition, licences, Audible, Kindle. Gym classes stay Lifestyle / Fitness.",
    "- Lifestyle = shopping, entertainment, personal care, fitness, recreational. Bars are Entertainment, not Alcohol.",
    "",
    "CANONICAL CATEGORIES: reuse these exact names. Do not invent a near-duplicate.",
    ...CANONICAL_CATEGORIES.map((name) => `- ${name}`),
    "",
    "SPLIT RULES (never keep 'X and Y' or 'X & Y' as one category):",
    "- Groceries vs Restaurants vs Takeout vs Delivery: store food = Groceries; sit-down/fast food = Restaurants; pickup = Takeout; Uber Eats/Skip = Delivery.",
    "- Drink vs Alcohol vs bars: coffee/tea/juice = Drink; LCBO/beer store = Alcohol; bar, pub, nightclub tab = Entertainment / Bars.",
    "- Convenience: 7-Eleven/corner food = Groceries / Convenience Store. Mixed merchandise convenience stays Shopping / Convenience Stores.",
    "- Housing: rent PAD and mortgage both go under Housing (Rent / Mortgage subcategory). Repairs = Home Maintenance.",
    "- Software: SaaS/dev tools/apps. Recurring bill = transactionCode subscription, not a category. Streaming = Entertainment / Streaming.",
    "- Rideshare vs Transit: Uber/Lyft/taxi = Rideshare; bus/metro/GO/parking fare = Transit. VIA/Amtrak = Transit / Intercity Rail.",
    "- ATM: cash advance and ATM withdrawal share one Transfers category.",
    "- Hair: Barbers and Salons under Personal Care. Do not invent Hair Salons as a category.",
    "",
    "MERGE RULES (never split these):",
    "- Loans = Loan Payments, Student Loans, BNPL, LOC principal PAD. One bucket.",
    "- External Transfers = e-Transfer to/from a person, remittance, GLOBAL MONEY TRANSFER, P2P. Money left the household.",
    "- Account Transfers = INTERNET TRANSFER between own CIBC accounts, PAYMENT THANK YOU / card payoff, internal move. Not spending.",
    "- ATM = ATM withdrawals + cash advances. Do not keep a separate Cash category.",
    "- Travel / Flights = airlines, in-flight, baggage. Travel / Lodging = hotels and vacation rentals. Daily driving stays Transport.",
    "- Employment = Salary, payroll, PAY UTILITEK. Cashback = cashback / remise en argent.",
    "- Tax = GST/HST credit, tax credits, tax refunds.",
    "- Government Benefits = unemployment, child benefit, pension, social assistance. Not tax credits.",
    "- Banking Fees = interest charged, account fees. Not card payoffs.",
    "- Refunds of purchases keep the original spend category (Shopping etc.), transactionCode refund. Never Income.",
    "",
    "DO NOT CREATE: Food and Drink, Food as a category, Delivery Services, Restaurants & Cafes, Software and Subscriptions, Software & Subscriptions, Subscriptions, Rent and Housing, Rideshare and Transit, Cash, Hair Salons, Loan Payments, Remittance, Airlines, Automotive, Auto Dealers and Services, Salary and Wages, Rewards and Cashback, Rewards and Rebates, Bank Transfers, Tax Benefits and Credits, Tax Refunds as a category, International Transfers, Rent, Sightseeing, Travel as a category or tag, Bank Fees, Money Transfers, Employment Income, Rewards, Pets under Lifestyle, Education under Lifestyle, Career under Lifestyle, Books under Entertainment, Bars under Alcohol, any label with &.",
  ].join("\n");
}
