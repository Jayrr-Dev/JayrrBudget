import { foldMerchantName } from "@/domains/merchants/domain/clusterSimilarMerchants";

/**
 * Bank shorthand the statement prints instead of the brand.
 * The model may say Amazon when the line only says Amzn.
 */
const TOKEN_ALIASES: Record<string, string> = {
  amzn: "amazon",
  mktp: "amazon",
};

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
}

/**
 * Keep a model title only when it is still the same payee as the bank line.
 * Empty means "no payee" and is allowed only for punctuation.
 * Returns null when the title should be ignored.
 */
export function merchantRewriteName(
  raw: string,
  proposed: string,
): string | null {
  const source = raw.replace(/\s+/g, " ").trim();
  const next = proposed.replace(/\s+/g, " ").trim();
  if (!next) {
    if (!/[a-z0-9]/i.test(source)) return "";
    return null;
  }
  if (next.length > 60) return null;
  if (next.toLowerCase() === source.toLowerCase()) return null;

  const rawFold = foldMerchantName(source);
  const nextFold = foldMerchantName(next);
  if (nextFold.length >= 3 && rawFold.includes(nextFold)) return next;

  const rawTokens = tokens(source);
  for (const token of tokens(next)) {
    if (rawFold.includes(token)) return next;
  }
  for (const rawToken of rawTokens) {
    const alias = TOKEN_ALIASES[rawToken];
    if (alias && nextFold === alias) return next;
  }
  return null;
}
