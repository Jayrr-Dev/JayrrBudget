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
const TREE: Array<[section: string, category: string, subcategories: string[]]> = [
  [
    "Finance",
    "Banking Fees",
    ["Monthly Fees", "Overdraft & Interest", "Transfer Fees", "ATM Fees", "Foreign Exchange"],
  ],
  [
    "Finance",
    "Debt & Loans",
    ["Student Loans", "Personal Financing", "BNPL", "Credit Card Interest", "Line of Credit"],
  ],
  [
    "Finance",
    "Insurance",
    [
      "Payment Protection",
      "Property & Auto Insurance",
      "Life Insurance",
      "Tenant Insurance",
      "Health Insurance",
      "Travel Insurance",
    ],
  ],
  ["Finance", "Investments", ["Brokerage & Crypto", "Retirement Accounts", "Trading Fees", "Robo-Advisor"]],
  ["Finance", "Tax Payments", ["Income Tax", "Property Tax"]],

  ["Income", "Employment", ["Salary & Wages", "Bonus", "Contractor Pay"]],
  ["Income", "Government & Tax", ["Tax Credits & GST", "Tax Refunds"]],
  [
    "Income",
    "Government Benefits",
    ["Unemployment", "Child Benefit", "Pension", "Disability", "Social Assistance"],
  ],
  ["Income", "Cashback & Rebates", ["Cashback Rewards", "Merchant Rebates"]],

  ["Transfers", "Account Transfers", ["Credit Card Payoffs", "Self Transfers", "Investment Transfers"]],
  ["Transfers", "External Transfers", ["Interac e-Transfer", "Remittances", "P2P Apps"]],
  ["Transfers", "Cash & ATM", ["ATM Withdrawals", "Cash Advances", "Cash Deposits"]],

  ["Home", "Housing", ["Rent", "Mortgage", "Parking Rent", "Storage Rent"]],
  [
    "Home",
    "Utilities & Telecom",
    ["Electricity", "Natural Gas", "Water", "Garbage", "Internet", "Mobile & Wireless"],
  ],
  [
    "Home",
    "Home Maintenance",
    ["Hardware & Tools", "Equipment Rental", "Repairs", "Cleaning", "Lawn & Snow", "Pest Control"],
  ],
  ["Home", "Furnishings", ["Furniture", "Appliances", "Decor", "Housewares", "Bedding"]],

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
  ["Food", "Specialty Food", ["Bakery", "Butcher", "Specialty Grocery", "Seafood", "Cheese & Deli"]],
  ["Food", "Drink", ["Coffee", "Tea", "Juice & Smoothies", "Soft Drinks"]],
  ["Food", "Alcohol", ["Liquor Store", "Beer & Wine Store"]],

  [
    "Lifestyle",
    "Entertainment",
    [
      "Streaming",
      "Video Games & Digital Goods",
      "Cinemas",
      "Museums & Culture",
      "Sports",
      "Concerts & Events",
      "Bars & Pubs",
    ],
  ],
  [
    "Lifestyle",
    "Shopping",
    [
      "Department & Online Stores",
      "Convenience Stores",
      "Discount Stores",
      "Electronics",
      "Hobbies",
      "Apparel",
      "Footwear",
    ],
  ],
  ["Lifestyle", "Personal Care", ["Gym Memberships", "Barbers & Salons", "Cosmetics", "Toiletries"]],
  ["Lifestyle", "Fitness", ["Classes", "Equipment", "Coaching"]],
  ["Lifestyle", "Recreational", ["Golf", "Pickleball", "Driving Range", "Board Game Cafes", "Bowling", "Climbing"]],
  ["Lifestyle", "Gifts & Giving", ["Personal Gifts", "Charity", "Cards & Wrapping"]],
  ["Lifestyle", "Business Services", ["Accounting", "Legal", "Advertising", "Consulting"]],

  [
    "Development",
    "Education",
    ["Courses & Training", "Classes", "Tuition", "Tutoring", "Certification"],
  ],
  ["Development", "Career", ["Licensing", "Conferences", "Memberships", "Exam Fees"]],
  ["Development", "Books", ["Print & Ebooks", "Audiobooks", "Magazines"]],

  [
    "Technology",
    "Software",
    ["Security & System Tools", "Productivity & Creative", "Communication & Social"],
  ],
  ["Technology", "Cloud & Hosting", ["Developer & Payment Platforms", "Infrastructure", "Domains & Registrars"]],
  ["Technology", "AI Services", ["AI Code Editors & IDEs", "AI Assistants & Chat", "Model APIs & Inference"]],
  ["Technology", "Devices", ["Computers", "Phones", "Tablets", "Wearables", "Accessories"]],

  ["Family", "Childcare", ["Daycare", "Babysitting", "After School", "Camps"]],
  ["Family", "Kids", ["Clothing", "Toys & Activities", "School Supplies"]],
  ["Family", "Elder Support", ["Care & Support", "Home Help"]],
  ["Family", "Pets", ["Pet Food", "Pet Supplies", "Veterinary", "Grooming", "Boarding"]],

  ["Travel", "Flights", ["Airline Tickets", "In-Flight", "Baggage & Seat Fees"]],
  ["Travel", "Lodging", ["Hotels", "Vacation Rentals", "Hostels"]],
  ["Travel", "Attractions & Tours", ["Tickets", "Guided Tours", "Theme Parks"]],

  ["Transport", "Fuel", ["Gas Stations", "Diesel", "EV Charging"]],
  ["Transport", "Rideshare", ["Uber & Lyft", "Taxi"]],
  ["Transport", "Transit", ["Public Transit", "Transit Pass", "Intercity Rail"]],
  ["Transport", "Auto Care & Expenses", ["Maintenance", "Tires", "Parking", "Car Wash", "Tolls", "Registration"]],
  ["Transport", "Dealership", ["Service & Sales", "Parts"]],
  ["Transport", "Vehicle Payments", ["Car Payment", "Lease"]],
  ["Transport", "Rentals", ["Car Rental", "Bike & Scooter"]],

  ["Health", "Medical", ["Clinics & Telehealth", "Hospital", "Pharmacies", "Prescriptions", "Supplements"]],
  ["Health", "Dental", ["Checkup & Cleaning", "Treatment", "Orthodontics"]],
  ["Health", "Vision", ["Eye Exam", "Glasses & Contacts"]],
  ["Health", "Therapy", ["Counselling", "Psychiatry"]],
];

/** One-off catalog renames applied before reconcile retire/add. */
export const CATEGORY_RENAMES: Array<{ from: string; to: string }> = [
  { from: "Software & Subscriptions", to: "Software" },
  { from: "Delivery Services", to: "Delivery" },
];

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

export const CATEGORY_SECTION_MOVES: Array<{ name: string; toSection: string }> = [
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
    toSub: "Print & Ebooks",
  },
  {
    fromCategory: "Entertainment",
    fromSub: "Education & Training",
    toSection: "Development",
    toCategory: "Education",
    toSub: "Courses & Training",
  },
  {
    fromCategory: "Alcohol",
    fromSub: "Bars & Pubs",
    toSection: "Lifestyle",
    toCategory: "Entertainment",
    toSub: "Bars & Pubs",
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
