/**
 * Short blurbs for spend-tree lookup rows (sections, categories, …).
 * Unknown names fall back to a generic line so inserts always have text.
 */

function norm(value: string) {
  return value.trim().toLowerCase();
}

const SECTIONS: Record<string, string> = {
  finance: "Banking, debt, insurance, and investments.",
  lifestyle: "Everyday living: food, shopping, entertainment, personal care.",
  transfers: "Money moved between accounts or people (not household spend).",
  income: "Pay, benefits, cashback, and other real money in.",
  technology: "Software, AI tools, cloud, and digital subscriptions.",
  transport: "Getting around: fuel, transit, rideshare, auto, flights.",
  health: "Medical care, pharmacies, and related health costs.",
  home: "Housing costs, utilities, and home maintenance.",
};

const CATEGORIES: Record<string, string> = {
  "ai services": "AI apps, assistants, editors, and model APIs.",
  "account transfers": "Moves between your own accounts or card payoffs.",
  "attractions & tours": "Tickets, tours, and paid sightseeing.",
  "auto care & expenses": "Car wash, maintenance, parking, and upkeep.",
  "banking fees": "Monthly fees, overdraft, interest, and transfer fees.",
  "cash & atm": "ATM withdrawals and cash advances.",
  "cashback & rebates": "Card rewards and merchant rebates credited to you.",
  "cloud & hosting": "Infrastructure, domains, and developer platforms.",
  dealership: "Dealer service, parts, and vehicle sales.",
  "debt & loans": "Loan payments, BNPL, and personal financing.",
  "delivery services": "Food and goods delivered to you.",
  employment: "Salary, wages, and employer pay.",
  entertainment: "Streaming, games, cinema, and paid leisure.",
  "external transfers": "e-Transfer, remittance, and money to other people.",
  flights: "Airline tickets and in-flight purchases.",
  food: "Groceries and supermarket food.",
  fuel: "Gas stations and vehicle fuel.",
  "government & tax": "Tax refunds, credits, GST, and government benefits.",
  "home maintenance": "Repairs, hardware, and home upkeep.",
  insurance: "Property, auto, and payment-protection coverage.",
  investments: "Brokerage, crypto, and investment accounts.",
  lodging: "Hotels and vacation rentals.",
  medical: "Clinics, telehealth, pharmacies, and prescriptions.",
  "mobile & wireless": "Phone plans and mobile service.",
  "personal care": "Hair, gym, cosmetics, and pet care.",
  recreational: "Sports, hobbies, and recreation venues.",
  rentals: "Short-term equipment or property rentals.",
  rideshare: "Uber, Lyft, and similar rides.",
  shopping: "Stores, apparel, electronics, and online retail.",
  sightseeing: "Museums, cultural sites, and sightseeing.",
  "software & subscriptions": "Apps, SaaS, and recurring digital tools.",
  streaming: "Video and music streaming services.",
  transit: "Public transit and passes.",
  "utilities & telecom": "Power, water, internet, and telecom bills.",
  vehicle: "Car rental and vehicle hire.",
};

const SUBCATEGORIES: Record<string, string> = {
  "ai assistants & chat": "ChatGPT-style assistants and chat products.",
  "ai code editors & ides": "AI coding editors and IDE add-ons.",
  "atm withdrawals": "Cash taken from an ATM.",
  "airline tickets": "Booked flights and airfare.",
  apparel: "Clothing and accessories.",
  "attractions & tours": "Paid attractions and guided tours.",
  bnpl: "Buy-now-pay-later installments.",
  "barbers & salons": "Haircuts and salon services.",
  "board game cafes": "Cafe visits centered on games.",
  "brokerage & crypto": "Brokerage trades and crypto moves.",
  "car insurance": "Vehicle insurance premiums.",
  "car rental": "Short-term car hire.",
  "car wash": "Car wash and detailing.",
  "cash advances": "Cash advances on a card or LOC.",
  "cashback rewards": "Cashback credited from cards or merchants.",
  "cellphone plan": "Mobile phone plan charges.",
  cinemas: "Movie tickets and theater snacks.",
  "clinics & telehealth": "Doctor visits and telehealth.",
  "communication & social": "Messaging and social apps.",
  convenience: "Convenience and corner stores.",
  cosmetics: "Makeup and beauty products.",
  "credit card payoffs": "Paying down your own credit card.",
  "department & online stores": "Department stores and big online retailers.",
  "developer & payment platforms": "Dev platforms and payment processors.",
  "dine-in": "Eating out at restaurants.",
  "discount stores": "Discount and dollar stores.",
  "domains & registrars": "Domain names and DNS registrars.",
  "driving range": "Golf driving range fees.",
  "education & training": "Courses, classes, and training.",
  electronics: "Gadgets and electronics.",
  "fast food": "Quick-service and fast food.",
  "food delivery": "Meal delivery apps and couriers.",
  fuel: "Fuel purchased at the pump.",
  "gas stations": "Gas station purchases.",
  golf: "Golf fees and related spend.",
  "gym memberships": "Gym and fitness memberships.",
  "hardware & tools": "Hardware stores and tools.",
  hobbies: "Hobby supplies and kits.",
  "hotels & vacation rentals": "Hotels and short-term stays.",
  "in-flight": "Purchases made on a flight.",
  infrastructure: "Cloud servers and hosting infra.",
  "interac e-transfer": "Interac e-Transfer to/from a person.",
  maintenance: "Vehicle repairs and maintenance.",
  "mobile & wireless": "Mobile/wireless plan charges.",
  "model apis & inference": "Paid AI model API usage.",
  "monthly fees": "Recurring bank account fees.",
  "museums and cultural": "Museums and cultural venues.",
  "overdraft & interest": "Overdraft fees and interest charges.",
  parking: "Parking lots and meters.",
  "payment protection": "Payment protection insurance.",
  "personal financing": "Personal loans and financing.",
  "pet supplies": "Pet food and supplies.",
  pharmacies: "Pharmacy purchases.",
  pickleball: "Pickleball courts and gear.",
  prescriptions: "Prescription medication.",
  "productivity & creative": "Productivity and creative software.",
  "property & auto insurance": "Home and auto insurance.",
  "public transit": "Bus, train, and transit fares.",
  recreation: "General recreation spend.",
  remittances: "International remittances and money sent abroad.",
  restaurants: "Restaurant meals.",
  rideshare: "Rideshare trips.",
  "salary & wages": "Paycheque and wage deposits.",
  "security & utilities": "Security and utility software.",
  "self transfers": "Transfers between your own accounts.",
  "service & sales": "Dealer service and vehicle sales.",
  sports: "Sports events and gear.",
  streaming: "Streaming subscriptions.",
  "student loans": "Student loan payments.",
  supermarkets: "Grocery supermarket trips.",
  supplements: "Vitamins and supplements.",
  "tax credits & gst": "GST/HST credits and tax benefits.",
  "tax refunds": "Income tax refunds.",
  "theme parks": "Theme park tickets.",
  tours: "Guided tours.",
  "transfer fees": "Fees charged to move money.",
  veterinary: "Vet visits and pet medical care.",
  "video games & digital goods": "Games and digital content.",
};

const TYPES: Record<string, string> = {
  expenses: "Money spent on goods and services.",
  income: "Money received as income.",
  transfers: "Money moved, not spent or earned as income.",
};

const KINDS: Record<string, string> = {
  fee: "A fee or service charge.",
  "fee; subscription": "A fee that is also a subscription.",
  interest: "Interest charged or earned.",
  statement: "A statement-related line.",
  subscription: "A recurring subscription charge.",
};

export type TaxonomyFacet =
  | "section"
  | "category"
  | "subcategory"
  | "type"
  | "kind";

const BY_FACET: Record<TaxonomyFacet, Record<string, string>> = {
  section: SECTIONS,
  category: CATEGORIES,
  subcategory: SUBCATEGORIES,
  type: TYPES,
  kind: KINDS,
};

const FALLBACK_LABEL: Record<TaxonomyFacet, string> = {
  section: "Spend section",
  category: "Spend category",
  subcategory: "Spend subcategory",
  type: "Transaction type",
  kind: "Transaction kind",
};

/** Resolve a description for a taxonomy name; never returns empty. */
export function taxonomyDescription(
  facet: TaxonomyFacet,
  name: string,
): string {
  const trimmed = name.trim();
  const known = BY_FACET[facet][norm(trimmed)];
  if (known) return known;
  return `${FALLBACK_LABEL[facet]}: ${trimmed || "Custom"}.`;
}
