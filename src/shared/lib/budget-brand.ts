const FALLBACK_BRAND = "JayrrBudget";

/** Turn "Jane Doe" into "Jane Budget"; missing name keeps JayrrBudget. */
export function budgetBrandLabel(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0];
  if (!first) return FALLBACK_BRAND;
  return `${first} Budget`;
}
