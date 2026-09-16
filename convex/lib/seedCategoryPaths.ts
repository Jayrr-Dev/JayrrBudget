type SeedPath = {
  section: string;
  category: string;
  subcategory: string | null;
};

/**
 * Canonical shared vocabulary. One name per real-world bucket; no near-dupes.
 * Extra shelves from the household taxonomy are folded in; names stay ours.
 * `classifications:reconcileSharedPaths` makes the live table match this list.
 */
const TREE: Array<
  [section: string, category: string, subcategories: string[]]
> = [
  [
    "Finance",
    "Banking Fees",
    [
      "Monthly Fees",
      "Interest",
      "Overdraft",
      "Transfer Fees",
      "ATM Fees",
      "Foreign Exchange",
    ],
  ],
  [
    "Finance",
    "Loans",
    [
      "Student Loans",
      "Personal Financing",
      "BNPL",
      "Credit Card Interest",
      "Line of Credit",
    ],
  ],
  [
    "Finance",
    "Insurance",
    [
      "Payment Protection",
      "Home Insurance",
      "Car Insurance",
      "Life Insurance",
      "Tenant Insurance",
      "Health Insurance",
      "Travel Insurance",
    ],
  ],
  [
    "Finance",
    "Investments",
    [
      "Brokerage",
      "Crypto",
      "Retirement Accounts",
      "Trading Fees",
      "Robo-Advisor",
    ],
  ],
  ["Finance", "Tax Payments", ["Income Tax", "Property Tax"]],

  ["Income", "Employment", ["Salary", "Bonus", "Contractor Pay"]],
  ["Income", "Tax", ["Tax Credits", "Tax Refunds"]],
  [
    "Income",
    "Government Benefits",
    [
      "Unemployment",
      "Child Benefit",
      "Pension",
      "Disability",
      "Social Assistance",
    ],
  ],
  ["Income", "Cashback", ["Cashback Rewards", "Merchant Rebates"]],

  [
    "Transfers",
    "Account Transfers",
    ["Credit Card Payoffs", "Self Transfers", "Investment Transfers"],
  ],
  [
    "Transfers",
    "External Transfers",
    ["Interac e-Transfer", "Remittances", "P2P Apps"],
  ],
  ["Transfers", "ATM", ["ATM Withdrawals", "Cash Advances", "Cash Deposits"]],

  ["Home", "Housing", ["Rent", "Mortgage", "Parking Rent", "Storage Rent"]],
  [
    "Home",
    "Utilities",
    ["Electricity", "Natural Gas", "Water", "Garbage", "Internet", "Mobile"],
  ],
  [
    "Home",
    "Home Maintenance",
    [
      "Hardware",
      "Equipment Rental",
      "Repairs",
      "Cleaning",
      "Lawn",
      "Snow",
      "Pest Control",
    ],
  ],
  [
    "Home",
    "Furnishings",
    ["Furniture", "Appliances", "Decor", "Housewares", "Bedding"],
  ],

  [
    "Food",
    "Groceries",
    ["Supermarket", "Produce", "Convenience Store", "Meal Kits"],
  ],
  [
    "Food",
    "Restaurants",
    ["Fast Food", "Casual Dining", "Fine Dining", "Cafes"],
  ],
  ["Food", "Takeout", ["Restaurant Pickup", "Prepared Meals"]],
  ["Food", "Delivery", ["Food Delivery", "Delivery Fees"]],
  [
    "Food",
    "Specialty Food",
    ["Bakery", "Butcher", "Specialty Grocery", "Seafood", "Cheese", "Deli"],
  ],
  ["Food", "Drink", ["Coffee", "Tea", "Juice", "Smoothies", "Soft Drinks"]],
  ["Food", "Alcohol", ["Liquor Store", "Beer Store", "Wine Store"]],

  [
    "Lifestyle",
    "Entertainment",
    ["Streaming", "Games", "Cinemas", "Museums", "Sports", "Concerts", "Bars"],
  ],
  [
    "Lifestyle",
    "Shopping",
    [
      "Online Stores",
      "Convenience Stores",
      "Discount Stores",
      "Electronics",
      "Hobbies",
      "Apparel",
      "Footwear",
    ],
  ],
  [
    "Lifestyle",
    "Personal Care",
    ["Gym Memberships", "Barbers", "Salons", "Cosmetics", "Toiletries"],
  ],
  ["Lifestyle", "Fitness", ["Classes", "Equipment", "Coaching"]],
  [
    "Lifestyle",
    "Recreational",
    [
      "Golf",
      "Pickleball",
      "Driving Range",
      "Board Game Cafes",
      "Bowling",
      "Climbing",
    ],
  ],
  ["Lifestyle", "Gifts", ["Personal Gifts", "Charity", "Cards"]],
  [
    "Lifestyle",
    "Business Services",
    ["Accounting", "Legal", "Advertising", "Consulting"],
  ],

  [
    "Development",
    "Education",
    ["Courses", "Classes", "Tuition", "Tutoring", "Certification"],
  ],
  [
    "Development",
    "Career",
    ["Licensing", "Conferences", "Memberships", "Exam Fees"],
  ],
  ["Development", "Books", ["Ebooks", "Audiobooks", "Magazines"]],

  [
    "Technology",
    "Software",
    ["Security", "Productivity", "Creative", "Communication"],
  ],
  [
    "Technology",
    "Cloud",
    ["Developer", "Payments", "Infrastructure", "Domains"],
  ],
  ["Technology", "AI Services", ["Code Editors", "Assistants", "Model APIs"]],
  [
    "Technology",
    "Devices",
    ["Computers", "Phones", "Tablets", "Wearables", "Accessories"],
  ],

  ["Family", "Childcare", ["Daycare", "Babysitting", "After School", "Camps"]],
  ["Family", "Kids", ["Clothing", "Toys", "School Supplies"]],
  ["Family", "Elder Support", ["Care", "Home Help"]],
  [
    "Family",
    "Pets",
    ["Pet Food", "Pet Supplies", "Veterinary", "Grooming", "Boarding"],
  ],

  ["Travel", "Flights", ["Airline Tickets", "In-Flight", "Baggage"]],
  ["Travel", "Lodging", ["Hotels", "Vacation Rentals", "Hostels"]],
  ["Travel", "Attractions", ["Tickets", "Guided Tours", "Theme Parks"]],

  ["Transport", "Fuel", ["Gas Stations", "Diesel", "EV Charging"]],
  ["Transport", "Rideshare", ["Uber", "Taxi"]],
  [
    "Transport",
    "Transit",
    ["Public Transit", "Transit Pass", "Intercity Rail"],
  ],
  [
    "Transport",
    "Auto",
    ["Maintenance", "Tires", "Parking", "Car Wash", "Tolls", "Registration"],
  ],
  ["Transport", "Dealership", ["Service", "Parts"]],
  ["Transport", "Vehicle Payments", ["Car Payment", "Lease"]],
  ["Transport", "Rentals", ["Car Rental", "Scooter"]],

  [
    "Health",
    "Medical",
    ["Clinics", "Hospital", "Pharmacies", "Prescriptions", "Supplements"],
  ],
  ["Health", "Dental", ["Checkup", "Treatment", "Orthodontics"]],
  ["Health", "Vision", ["Eye Exam", "Glasses", "Contacts"]],
  ["Health", "Therapy", ["Counselling", "Psychiatry"]],
];

/** One-off catalog renames applied before reconcile retire/add. */
export const CATEGORY_RENAMES: Array<{ from: string; to: string }> = [
  { from: "Software & Subscriptions", to: "Software" },
  { from: "Delivery Services", to: "Delivery" },
  { from: "Debt & Loans", to: "Loans" },
  { from: "Government & Tax", to: "Tax" },
  { from: "Cashback & Rebates", to: "Cashback" },
  { from: "Utilities & Telecom", to: "Utilities" },
  { from: "Cloud & Hosting", to: "Cloud" },
  { from: "Cash & ATM", to: "ATM" },
  { from: "Attractions & Tours", to: "Attractions" },
  { from: "Auto Care & Expenses", to: "Auto" },
  { from: "Gifts & Giving", to: "Gifts" },
];

export const SUBCATEGORY_RENAMES: Array<{ from: string; to: string }> = [
  { from: "Overdraft & Interest", to: "Interest" },
  { from: "Property & Auto Insurance", to: "Home Insurance" },
  { from: "Brokerage & Crypto", to: "Brokerage" },
  { from: "Salary & Wages", to: "Salary" },
  { from: "Tax Credits & GST", to: "Tax Credits" },
  { from: "Mobile & Wireless", to: "Mobile" },
  { from: "Hardware & Tools", to: "Hardware" },
  { from: "Lawn & Snow", to: "Lawn" },
  { from: "Cheese & Deli", to: "Deli" },
  { from: "Juice & Smoothies", to: "Juice" },
  { from: "Beer & Wine Store", to: "Beer Store" },
  { from: "Video Games & Digital Goods", to: "Games" },
  { from: "Museums & Culture", to: "Museums" },
  { from: "Concerts & Events", to: "Concerts" },
  { from: "Bars & Pubs", to: "Bars" },
  { from: "Department & Online Stores", to: "Online Stores" },
  { from: "Cards & Wrapping", to: "Cards" },
  { from: "Barbers & Salons", to: "Barbers" },
  { from: "Courses & Training", to: "Courses" },
  { from: "Print & Ebooks", to: "Ebooks" },
  { from: "Security & System Tools", to: "Security" },
  { from: "Productivity & Creative", to: "Productivity" },
  { from: "Communication & Social", to: "Communication" },
  { from: "Developer & Payment Platforms", to: "Developer" },
  { from: "Domains & Registrars", to: "Domains" },
  { from: "AI Code Editors & IDEs", to: "Code Editors" },
  { from: "AI Assistants & Chat", to: "Assistants" },
  { from: "Model APIs & Inference", to: "Model APIs" },
  { from: "Toys & Activities", to: "Toys" },
  { from: "Care & Support", to: "Care" },
  { from: "Baggage & Seat Fees", to: "Baggage" },
  { from: "Uber & Lyft", to: "Uber" },
  { from: "Service & Sales", to: "Service" },
  { from: "Bike & Scooter", to: "Scooter" },
  { from: "Clinics & Telehealth", to: "Clinics" },
  { from: "Checkup & Cleaning", to: "Checkup" },
  { from: "Glasses & Contacts", to: "Glasses" },
];

function renameMap(rows: Array<{ from: string; to: string }>) {
  return new Map(rows.map((row) => [row.from.trim().toLowerCase(), row.to]));
}

const CATEGORY_RENAME_MAP = renameMap(CATEGORY_RENAMES);
const SUBCATEGORY_RENAME_MAP = renameMap(SUBCATEGORY_RENAMES);

/** Map a stored category/sub label onto the shortened catalog name. */
export function rewriteTaxonomyLabel(
  kind: "category" | "subcategory",
  name: string | null | undefined,
): string | null {
  if (name == null) return null;
  const trimmed = name.trim();
  if (!trimmed) return name;
  const map =
    kind === "category" ? CATEGORY_RENAME_MAP : SUBCATEGORY_RENAME_MAP;
  return map.get(trimmed.toLowerCase()) ?? name;
}

/** Move these categories onto the Food section after rename. */
export const FOOD_SECTION_CATEGORY_MOVES = [
  "Groceries",
  "Restaurants",
  "Takeout",
  "Delivery",
  "Specialty Food",
  "Drink",
  "Alcohol",
] as const;

export const CATEGORY_SECTION_MOVES: Array<{
  name: string;
  toSection: string;
}> = [
  { name: "Pets", toSection: "Family" },
  { name: "Education", toSection: "Development" },
  { name: "Career", toSection: "Development" },
];

export const SUBCATEGORY_REMOUNTS: Array<{
  fromCategory: string;
  fromSub: string;
  toSection: string;
  toCategory: string;
  toSub: string;
}> = [
  {
    fromCategory: "Entertainment",
    fromSub: "Books",
    toSection: "Development",
    toCategory: "Books",
    toSub: "Ebooks",
  },
  {
    fromCategory: "Entertainment",
    fromSub: "Education & Training",
    toSection: "Development",
    toCategory: "Education",
    toSub: "Courses",
  },
  {
    fromCategory: "Alcohol",
    fromSub: "Bars & Pubs",
    toSection: "Lifestyle",
    toCategory: "Entertainment",
    toSub: "Bars",
  },
];

/** Old Food / Restaurants & Cafes subs → new Food category + sub. */
export const FOOD_SUB_REMOUNTS: Array<{
  fromSub: string;
  toCategory: string;
  toSub: string;
}> = [
  { fromSub: "Supermarkets", toCategory: "Groceries", toSub: "Supermarket" },
  { fromSub: "Supermarket", toCategory: "Groceries", toSub: "Supermarket" },
  { fromSub: "Meal Kits", toCategory: "Groceries", toSub: "Meal Kits" },
  { fromSub: "Restaurants", toCategory: "Restaurants", toSub: "Casual Dining" },
  { fromSub: "Dine-In", toCategory: "Restaurants", toSub: "Casual Dining" },
  { fromSub: "Fast Food", toCategory: "Restaurants", toSub: "Fast Food" },
  { fromSub: "Cafes", toCategory: "Restaurants", toSub: "Cafes" },
  { fromSub: "Takeout", toCategory: "Takeout", toSub: "Restaurant Pickup" },
  { fromSub: "Food Delivery", toCategory: "Delivery", toSub: "Food Delivery" },
  { fromSub: "Delivery Fees", toCategory: "Delivery", toSub: "Delivery Fees" },
];

/** Flattened section/category/subcategory paths (category-only row first). */
export const SEED_CATEGORY_PATHS: SeedPath[] = TREE.flatMap(
  ([section, category, subcategories]) => [
    { section, category, subcategory: null },
    ...subcategories.map((subcategory) => ({ section, category, subcategory })),
  ],
);
