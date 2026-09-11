/** Title-case place names: TORONTO → Toronto, NEW YORK → New York. */
export function normalizePlaceName(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  return trimmed
    .split(" ")
    .map((word) => {
      if (/^[A-Za-z]\.[A-Za-z]\.?$/.test(word)) {
        // Keep short initials like St. / N.Y.
        return word
          .split(".")
          .map((part) =>
            part
              ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
              : "",
          )
          .join(".");
      }
      if (word.includes("-")) {
        return word
          .split("-")
          .map((part) =>
            part
              ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
              : "",
          )
          .join("-");
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
