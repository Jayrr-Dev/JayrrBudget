import type { AnalysisSourceRow } from "./analysisTypes";
import { cleanMerchantDescriptor } from "./cleanMerchantDescriptor";

export type DescriptorCategoryFix = {
  merchant: string;
  section: string;
  category: string;
  subcategory: string;
  spread: "Needs" | "Wants";
  patterns: RegExp[];
};

/** First match wins. Used when a row has no distinct subcategory. */
export const DESCRIPTOR_CATEGORY_FIXES: DescriptorCategoryFix[] = [
  {
    merchant: "Airbnb",
    section: "Travel",
    category: "Lodging",
    subcategory: "Vacation Rentals",
    spread: "Wants",
    patterns: [/airbnb/i],
  },
  {
    merchant: "Marblism",
    section: "Technology",
    category: "AI Services",
    subcategory: "Model APIs",
    spread: "Wants",
    patterns: [/marblism/i],
  },
  {
    merchant: "Aldo",
    section: "Lifestyle",
    category: "Shopping",
    subcategory: "Apparel",
    spread: "Wants",
    patterns: [/\baldo\b/i],
  },
  {
    merchant: "Rustan's",
    section: "Lifestyle",
    category: "Shopping",
    subcategory: "Online Stores",
    spread: "Wants",
    patterns: [/rustan'?s/i],
  },
  {
    merchant: "Salon de Rose",
    section: "Lifestyle",
    category: "Personal Care",
    subcategory: "Barbers",
    spread: "Wants",
    patterns: [/salon\s*de\s*rose/i],
  },
  {
    merchant: "L Caminade Tan Mktg",
    section: "Lifestyle",
    category: "Shopping",
    subcategory: "Online Stores",
    spread: "Wants",
    patterns: [/caminade/i],
  },
  {
    merchant: "CIBC Car Loan",
    section: "Finance",
    category: "Loans",
    subcategory: "Personal Financing",
    spread: "Needs",
    patterns: [/cibc\s*loans/i, /cibc\s*car\s*loan/i],
  },
  {
    merchant: "Loan Payment",
    section: "Finance",
    category: "Loans",
    subcategory: "Personal Financing",
    spread: "Needs",
    patterns: [/loan\s*payment/i],
  },
];

export function matchDescriptorFix(
  blob: string,
): DescriptorCategoryFix | null {
  const text = blob.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return DESCRIPTOR_CATEGORY_FIXES.find((fix) =>
    fix.patterns.some((pattern) => pattern.test(text)),
  ) ?? null;
}

function typeKey(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function hasDistinctSubcategory(row: AnalysisSourceRow) {
  const typeName = row.typeName?.trim();
  if (!typeName) return false;
  const category = row.categoryName?.trim() ?? "";
  if (!category) return true;
  return typeKey(typeName) !== typeKey(category);
}

/** Clean merchant labels; fill section/category/subcategory when unspecified. */
export function applyDescriptorInference(
  row: AnalysisSourceRow,
): AnalysisSourceRow {
  const blob = `${row.merchantClean ?? ""} ${row.description ?? ""}`;
  const cleaned =
    cleanMerchantDescriptor(row.merchantClean) ??
    cleanMerchantDescriptor(row.description) ??
    row.merchantClean;
  const fix = matchDescriptorFix(blob);
  if (hasDistinctSubcategory(row)) {
    return {
      ...row,
      merchantClean: cleaned,
    };
  }
  if (!fix) {
    return {
      ...row,
      merchantClean: cleaned,
    };
  }
  return {
    ...row,
    merchantClean: cleanMerchantDescriptor(fix.merchant) ?? cleaned,
    sectionName: fix.section,
    categoryName: fix.category,
    typeName: fix.subcategory,
    spreadName: row.spreadName?.trim() || fix.spread,
  };
}
