/**
 * Shared merchant-name instructions for parse, categorize, and enrich prompts.
 * Raw card descriptors stay in description only.
 */
export const MERCHANT_CLEAN_AI_RULES = [
  "MERCHANT NAME (required clean):",
  "Emit a short brand/payee title only. Never copy the raw card-network line.",
  "description keeps the full original text. merchant/merchantName/merchantClean does not.",
  "Always strip: city, mall, country; foreign amount + currency (PHP, USD, …); @ exchange rate; *reference codes; store numbers; websites (.COM/.CA); glued location suffixes.",
  "Title-case the brand. Keep Uber vs Uber Eats as distinct services.",
  "Examples (input descriptor → merchant):",
  "- ALDO CEBU CITY 12,280.00 PHP @ 0.024 → Aldo",
  "- AIRBNB *HM3YTARTTM AIRBNB.COM → Airbnb",
  "- RUSTANS DEPT STORE CEBU CITY 6,760.00 PHP @ 0.024 → Rustan's",
  "- SALON DE ROSE CEN BLOC CEBU 6,500.00 PHP @ 0.024 → Salon de Rose",
  "- L CAMINADE TAN MKTG CEBU CITY 5,270.00 PHP @ 0.024 → L Caminade Tan Mktg",
  "- UBER CANADA/UBEREATS → Uber Eats",
  "Never truncate with ellipsis. Never leave PHP, @, or a city in the merchant field.",
].join("\n");
