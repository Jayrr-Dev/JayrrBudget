export function normalizeCategoryLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™©]/g, "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Collapse obvious plural/singular noise for matching. */
export function singularCategoryKey(value: string) {
  const normalized = normalizeCategoryLabel(value);
  if (!normalized) return "";

  return normalized
    .split(" ")
    .map((word) => {
      if (word.length <= 3) return word;
      if (word.endsWith("ies") && word.length > 4) {
        return `${word.slice(0, -3)}y`;
      }
      if (
        word.endsWith("sses") ||
        word.endsWith("shes") ||
        word.endsWith("ches")
      ) {
        return word.slice(0, -2);
      }
      if (word.endsWith("s") && !word.endsWith("ss")) {
        return word.slice(0, -1);
      }
      return word;
    })
    .join(" ");
}
