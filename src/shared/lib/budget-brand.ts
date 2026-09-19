const FALLBACK_BRAND = "Jev's Budget";

/** Turn "Jane Doe" into "Jane's Budget"; missing name keeps Jev's Budget. */
export function budgetBrandLabel(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0];
  if (!first) return FALLBACK_BRAND;
  return `${first}'s Budget`;
}
