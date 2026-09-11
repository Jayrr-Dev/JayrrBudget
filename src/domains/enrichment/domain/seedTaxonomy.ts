import { toSlug } from "@/domains/enrichment/domain/slug";

export type SeedTaxonomyNode = {
  facet: "section" | "category" | "type" | "tag" | "store_type" | "food_type";
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

  {
    facet: "category",
    name: "Food",
    parentSlug: "lifestyle",
  },
  {
    facet: "category",
    name: "Drink",
    parentSlug: "lifestyle",
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
    name: "Travel",
    parentSlug: "transport",
  },
  {
    facet: "category",
    name: "Auto",
    parentSlug: "transport",
  },
  {
    facet: "category",
    name: "Employment Income",
    parentSlug: "income",
  },
  {
    facet: "category",
    name: "Rewards",
    parentSlug: "income",
  },

  {
    facet: "type",
    name: "Restaurants",
    parentSlug: "food",
  },
  {
    facet: "type",
    name: "Delivery",
    parentSlug: "food",
  },
  {
    facet: "type",
    name: "Groceries",
    parentSlug: "food",
  },
  {
    facet: "type",
    name: "Coffee",
    parentSlug: "drink",
  },
  {
    facet: "type",
    name: "Online Marketplaces",
    parentSlug: "shopping",
  },
  {
    facet: "type",
    name: "Cloud Software",
    parentSlug: "software",
  },
  {
    facet: "type",
    name: "SaaS",
    parentSlug: "software",
  },
  {
    facet: "type",
    name: "Developer Tools",
    parentSlug: "software",
  },
  {
    facet: "type",
    name: "Streaming Services",
    parentSlug: "subscriptions",
  },
  {
    facet: "type",
    name: "Gyms",
    parentSlug: "entertainment",
  },
  {
    facet: "type",
    name: "Credit Card Payment",
    parentSlug: "account-transfers",
  },
  {
    facet: "type",
    name: "Loan Payment",
    parentSlug: "loans",
  },
  {
    facet: "type",
    name: "Hair Salons",
    parentSlug: "personal-care",
  },
  {
    facet: "type",
    name: "Barbers",
    parentSlug: "personal-care",
  },
  {
    facet: "type",
    name: "Gas Stations",
    parentSlug: "fuel",
  },
  {
    facet: "type",
    name: "Rideshare",
    parentSlug: "rideshare",
  },
  {
    facet: "type",
    name: "Transit",
    parentSlug: "transit",
  },
  {
    facet: "type",
    name: "Payment Protection",
    parentSlug: "insurance",
  },

  { facet: "tag", name: "Subscription" },
  { facet: "tag", name: "Statement" },
  { facet: "tag", name: "Fee" },
  { facet: "tag", name: "AI" },
  { facet: "tag", name: "Web Development" },
  { facet: "tag", name: "Developer Tools" },

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
  return toSlug(node.name);
}
