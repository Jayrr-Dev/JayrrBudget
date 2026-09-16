import { toSlug } from "@/domains/enrichment/domain/slug";
import {
  TRANSACTION_TYPE_NAMES,
  transactionTypeSlug,
  type TransactionTypeName,
} from "@/domains/enrichment/domain/transactionTypes";

export type SeedTaxonomyNode = {
  facet:
    | "section"
    | "category"
    | "subcategory"
    | "type"
    | "transaction_type"
    | "tag"
    | "store_type"
    | "food_type";
  name: string;
  parentSlug?: string | null;
};

/** Starter spend tree + common typed facets. AI may extend. */
export const SEED_TAXONOMY: SeedTaxonomyNode[] = [
  { facet: "section", name: "Lifestyle" },
  { facet: "section", name: "Home" },
  { facet: "section", name: "Transport" },
  { facet: "section", name: "Finance" },
  { facet: "section", name: "Health" },
  { facet: "section", name: "Income" },
  { facet: "section", name: "Transfers" },
  { facet: "section", name: "Travel" },
  { facet: "section", name: "Family" },
  { facet: "section", name: "Technology" },
  { facet: "section", name: "Food" },

  {
    facet: "category",
    name: "Groceries",
    parentSlug: "food",
  },
  {
    facet: "category",
    name: "Drink",
    parentSlug: "food",
  },
  {
    facet: "category",
    name: "Entertainment",
    parentSlug: "lifestyle",
  },
  {
    facet: "category",
    name: "Shopping",
    parentSlug: "lifestyle",
  },
  {
    facet: "category",
    name: "Software",
    parentSlug: "lifestyle",
  },
  {
    facet: "category",
    name: "Subscriptions",
    parentSlug: "lifestyle",
  },
  {
    facet: "category",
    name: "Personal Care",
    parentSlug: "lifestyle",
  },
  {
    facet: "category",
    name: "Attractions & Tours",
    parentSlug: "travel",
  },
  {
    facet: "category",
    name: "Lodging",
    parentSlug: "travel",
  },
  {
    facet: "category",
    name: "Flights",
    parentSlug: "travel",
  },
  {
    facet: "category",
    name: "Childcare",
    parentSlug: "family",
  },
  {
    facet: "category",
    name: "Kids",
    parentSlug: "family",
  },
  {
    facet: "category",
    name: "Elder Support",
    parentSlug: "family",
  },
  {
    facet: "category",
    name: "Utilities",
    parentSlug: "home",
  },
  {
    facet: "category",
    name: "Rent",
    parentSlug: "home",
  },
  {
    facet: "category",
    name: "Housing",
    parentSlug: "home",
  },
  {
    facet: "category",
    name: "Fuel",
    parentSlug: "transport",
  },
  {
    facet: "category",
    name: "Rideshare",
    parentSlug: "transport",
  },
  {
    facet: "category",
    name: "Transit",
    parentSlug: "transport",
  },
  {
    facet: "category",
    name: "Bank Fees",
    parentSlug: "finance",
  },
  {
    facet: "category",
    name: "Insurance",
    parentSlug: "finance",
  },
  {
    facet: "category",
    name: "Loans",
    parentSlug: "finance",
  },
  {
    facet: "category",
    name: "Money Transfers",
    parentSlug: "transfers",
  },
  {
    facet: "category",
    name: "Account Transfers",
    parentSlug: "transfers",
  },
  {
    facet: "category",
    name: "Auto",
    parentSlug: "transport",
  },
  {
    facet: "category",
    name: "Rentals",
    parentSlug: "transport",
  },
  {
    facet: "category",
    name: "Vehicle",
    parentSlug: "transport",
  },
  {
    facet: "category",
    name: "Employment Income",
    parentSlug: "income",
  },
  {
    facet: "category",
    name: "Government Benefits",
    parentSlug: "income",
  },
  {
    facet: "category",
    name: "Rewards",
    parentSlug: "income",
  },
  {
    facet: "category",
    name: "Medical",
    parentSlug: "health",
  },
  {
    facet: "category",
    name: "Investments",
    parentSlug: "finance",
  },
  {
    facet: "category",
    name: "Cash & ATM",
    parentSlug: "transfers",
  },

  {
    facet: "subcategory",
    name: "Restaurants",
    parentSlug: "food",
  },
  {
    facet: "subcategory",
    name: "Delivery",
    parentSlug: "food",
  },
  {
    facet: "subcategory",
    name: "Groceries",
    parentSlug: "food",
  },
  {
    facet: "subcategory",
    name: "Coffee",
    parentSlug: "drink",
  },
  {
    facet: "subcategory",
    name: "Online Marketplaces",
    parentSlug: "shopping",
  },
  {
    facet: "subcategory",
    name: "Cloud Software",
    parentSlug: "software",
  },
  {
    facet: "subcategory",
    name: "SaaS",
    parentSlug: "software",
  },
  {
    facet: "subcategory",
    name: "Developer Tools",
    parentSlug: "software",
  },
  {
    facet: "subcategory",
    name: "Streaming Services",
    parentSlug: "subscriptions",
  },
  {
    facet: "subcategory",
    name: "Gyms",
    parentSlug: "personal-care",
  },
  {
    facet: "subcategory",
    name: "Video Games",
    parentSlug: "entertainment",
  },
  {
    facet: "subcategory",
    name: "Entertainment Venues",
    parentSlug: "entertainment",
  },
  {
    facet: "subcategory",
    name: "Sports",
    parentSlug: "entertainment",
  },
  {
    facet: "subcategory",
    name: "Pharmacies",
    parentSlug: "medical",
  },
  {
    facet: "subcategory",
    name: "Medical Services",
    parentSlug: "medical",
  },
  {
    facet: "subcategory",
    name: "Credit Card Payment",
    parentSlug: "account-transfers",
  },
  {
    facet: "subcategory",
    name: "Loan Payment",
    parentSlug: "loans",
  },
  {
    facet: "subcategory",
    name: "Student Loans",
    parentSlug: "loans",
  },
  {
    facet: "subcategory",
    name: "Buy Now Pay Later",
    parentSlug: "loans",
  },
  {
    facet: "subcategory",
    name: "Hair Salons",
    parentSlug: "personal-care",
  },
  {
    facet: "subcategory",
    name: "Barbers",
    parentSlug: "personal-care",
  },
  {
    facet: "subcategory",
    name: "Gas Stations",
    parentSlug: "fuel",
  },
  {
    facet: "subcategory",
    name: "Rideshare",
    parentSlug: "rideshare",
  },
  {
    facet: "subcategory",
    name: "Transit",
    parentSlug: "transit",
  },
  {
    facet: "subcategory",
    name: "Payment Protection",
    parentSlug: "insurance",
  },
  {
    facet: "subcategory",
    name: "Cashback",
    parentSlug: "rewards",
  },
  {
    facet: "subcategory",
    name: "Paycheck",
    parentSlug: "employment-income",
  },
  {
    facet: "subcategory",
    name: "Unemployment",
    parentSlug: "government-benefits",
  },
  {
    facet: "subcategory",
    name: "Internal Transfers",
    parentSlug: "account-transfers",
  },
  {
    facet: "subcategory",
    name: "International Remittance",
    parentSlug: "money-transfers",
  },
  {
    facet: "subcategory",
    name: "E-Transfer",
    parentSlug: "money-transfers",
  },
  {
    facet: "subcategory",
    name: "Movie Theatres",
    parentSlug: "entertainment",
  },
  {
    facet: "subcategory",
    name: "Auto Repair and Maintenance",
    parentSlug: "auto",
  },
  {
    facet: "subcategory",
    name: "Car Dealerships",
    parentSlug: "auto",
  },
  {
    facet: "subcategory",
    name: "Car Wash",
    parentSlug: "auto",
  },
  {
    facet: "subcategory",
    name: "Monthly Fees",
    parentSlug: "bank-fees",
  },
  {
    facet: "subcategory",
    name: "Mortgage",
    parentSlug: "housing",
  },
  {
    facet: "subcategory",
    name: "Rent Payment",
    parentSlug: "rent",
  },
  {
    facet: "subcategory",
    name: "Electricity",
    parentSlug: "utilities",
  },
  {
    facet: "subcategory",
    name: "Tickets",
    parentSlug: "attractions-and-tours",
  },
  {
    facet: "subcategory",
    name: "Hotels",
    parentSlug: "lodging",
  },
  {
    facet: "subcategory",
    name: "Equipment Rental",
    parentSlug: "rentals",
  },
  {
    facet: "subcategory",
    name: "Car Rental",
    parentSlug: "vehicle",
  },

  { facet: "transaction_type", name: "income" },
  { facet: "transaction_type", name: "transfers" },
  { facet: "transaction_type", name: "expenses" },
  { facet: "type", name: "Subscription" },
  { facet: "type", name: "Statement" },
  { facet: "type", name: "Fee" },
  { facet: "tag", name: "AI" },
  { facet: "tag", name: "Dev Tools" },

  { facet: "store_type", name: "Cafe" },
  { facet: "store_type", name: "Restaurant" },
  { facet: "store_type", name: "Barber" },
  { facet: "store_type", name: "Gas Station" },
  { facet: "store_type", name: "Convenience Store" },

  { facet: "food_type", name: "Dessert" },
  { facet: "food_type", name: "Fast Food" },
  { facet: "food_type", name: "Coffee" },
];

export function seedNodeSlug(node: SeedTaxonomyNode) {
  if (node.facet === "transaction_type") {
    const name = node.name.trim().toLowerCase();
    if ((TRANSACTION_TYPE_NAMES as readonly string[]).includes(name)) {
      return transactionTypeSlug(name as TransactionTypeName);
    }
  }
  return toSlug(node.name);
}
