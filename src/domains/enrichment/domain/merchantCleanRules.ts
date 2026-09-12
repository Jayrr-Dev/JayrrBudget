/**
 * Deterministic merchant_clean → one canonical display name per real merchant.
 *
 * Policy (parent brand over product / legal suffix):
 * - Zoho Workplace → Zoho
 * - X Corp → X (Twitter/X brand)
 * - Uber Eats / Uber Direct / Uber Pass → Uber
 * - Amazon Marketplace / Amazon.ca / Audible → Amazon
 * - Google One / Google Cloud → Google
 * Case + singular/plural twins fold into the preferred spelling below.
 */

/** Lowercase exact key → canonical merchantClean. */
export const MERCHANT_CLEAN_ALIASES: Record<string, string> = {
  // Parent brands (user examples + company twins)
  "zoho workplace": "Zoho",
  zoho: "Zoho",
  "x corp": "X",
  x: "X",
  twitter: "X",
  "uber eats": "Uber",
  "uber direct": "Uber",
  "uber pass": "Uber",
  uber: "Uber",
  "amazon marketplace": "Amazon",
  "amazon.ca": "Amazon",
  audible: "Amazon",
  amazon: "Amazon",
  "google one": "Google",
  "google cloud": "Google",
  google: "Google",
  "wealthsimple tax": "Wealthsimple",
  "wealthsimple investments": "Wealthsimple",
  wealthsimple: "Wealthsimple",
  "pocketpills pharmacy": "PocketPills",
  pocketpills: "PocketPills",
  "claude.ai": "Anthropic",
  anthropic: "Anthropic",
  chatgpt: "OpenAI",
  openai: "OpenAI",

  // Singular / plural + spelling twins
  "abdl student loans": "ABDL Student Loan",
  "abdl student loan": "ABDL Student Loan",
  "cash advances": "Cash Advance",
  "cash advance": "Cash Advance",
  "cibc cash advances": "Cash Advance",
  "avis rent-a-car": "Avis",
  avis: "Avis",
  "wendy's restaurant": "Wendy's",
  "wendy's": "Wendy's",
  tacotime: "Taco Time",
  "taco time": "Taco Time",
  "newcastle barber shop": "Newcastle Barbershop",
  "newcastle barbershop": "Newcastle Barbershop",
  barburrito: "BarBurrito",

  // Case / location variants of same merchant
  moralitymed: "MoralityMed",
  "movati athletic": "Movati Athletic",
  "movati athletic albany": "Movati Athletic",
  epark: "EPark",
  "edmonton epark": "EPark",
  llaollao: "Llaollao",
  mbna: "MBNA",
  "mbna canada": "MBNA",
  "mbna canada mastercard": "MBNA",
  "mastercard mbna canada": "MBNA",
  "honk mobile": "Honk",
  "honk parking": "Honk",
  honk: "Honk",
  "landers central": "Landers",
  landers: "Landers",
  "costco gas": "Costco",
  "costco business centre": "Costco",
  "costco wholesale": "Costco",
  costco: "Costco",
  nslsc: "National Student Loans Service Centre",
  "national student loans service centre":
    "National Student Loans Service Centre",

  // Bank rail / fee label twins (company stays CIBC via companyRules)
  "internet transfer card payment": "Internet Transfer",
  "internet transfer to card": "Internet Transfer",
  "internet transfer to card 4500***1654": "Internet Transfer",
  "internet transfer to card 5268***9559": "Internet Transfer",
  "internet transfer": "Internet Transfer",
  "cashback / remise en argent": "Cashback",
  cashback: "Cashback",
  "cibc cashback": "Cashback",
  "payment protector insurance": "Payment Protector",
  "payment protector premium": "Payment Protector",
  "cibc payment protector": "Payment Protector",
  "payment protector": "Payment Protector",
  "tps/gst credit": "TPS / GST Credit",
  "tps / gst credit": "TPS / GST Credit",
  "cibc service charge": "Service Charge",
  "service charge": "Service Charge",
  "global money transfer": "CIBC Global Money Transfer",
  "cibc global money transfer": "CIBC Global Money Transfer",
  "cibc loans": "CIBC Car Loan",
  "cibc car loan": "CIBC Car Loan",
  "plc interest charged": "CIBC Line of Credit",
  "cibc line of credit": "CIBC Line of Credit",
  "cibc loc": "CIBC Line of Credit",
};

/**
 * Resolve merchantClean to canonical display form.
 * Exact alias first; otherwise return trimmed original (no fuzzy invent).
 */
export function canonicalizeMerchantClean(
  merchantClean: string | null | undefined,
): string | null {
  if (merchantClean == null) return null;
  const trimmed = merchantClean.trim();
  if (!trimmed) return null;

  const key = trimmed.toLowerCase();
  if (MERCHANT_CLEAN_ALIASES[key]) return MERCHANT_CLEAN_ALIASES[key];

  // Parameterized Internet Transfer to Card **** tails
  if (/^internet\s+transfer(\s+to\s+card)?/i.test(key)) {
    return "Internet Transfer";
  }

  return trimmed;
}
