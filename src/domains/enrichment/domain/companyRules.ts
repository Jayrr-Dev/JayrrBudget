/**
 * Deterministic merchantClean / description → company entity.
 * First matching rule wins. Prefer reusable patterns over one-offs.
 */

export type CompanyRef = {
  slug: string;
  displayName: string;
};

export type CompanyRule = {
  company: CompanyRef;
  /** Test against merchantClean + description blob. */
  patterns: RegExp[];
};

/** Exact merchant_clean → company (after trim). Case-insensitive key lookup. */
export const COMPANY_ALIASES: Record<string, CompanyRef> = {
  amazon: { slug: "amazon", displayName: "Amazon" },
  "amazon marketplace": { slug: "amazon", displayName: "Amazon" },
  "amazon.ca": { slug: "amazon", displayName: "Amazon" },
  audible: { slug: "amazon", displayName: "Amazon" },
  "uber eats": { slug: "uber", displayName: "Uber" },
  uber: { slug: "uber", displayName: "Uber" },
  "uber direct": { slug: "uber", displayName: "Uber" },
  "uber pass": { slug: "uber", displayName: "Uber" },
  "tim hortons": { slug: "tim-hortons", displayName: "Tim Hortons" },
  "mcdonald's": { slug: "mcdonalds", displayName: "McDonald's" },
  mcdonalds: { slug: "mcdonalds", displayName: "McDonald's" },
  openai: { slug: "openai", displayName: "OpenAI" },
  chatgpt: { slug: "openai", displayName: "OpenAI" },
  "claude.ai": { slug: "anthropic", displayName: "Anthropic" },
  anthropic: { slug: "anthropic", displayName: "Anthropic" },
  windsurf: { slug: "codeium", displayName: "Codeium" },
  cursor: { slug: "anysphere", displayName: "Anysphere" },
  netflix: { slug: "netflix", displayName: "Netflix" },
  lyft: { slug: "lyft", displayName: "Lyft" },
  "citi bike": { slug: "lyft", displayName: "Lyft" },
  fizz: { slug: "videotron", displayName: "Videotron" },
  "7-eleven": { slug: "7-eleven", displayName: "7-Eleven" },
  namecheap: { slug: "namecheap", displayName: "Namecheap" },
  vercel: { slug: "vercel", displayName: "Vercel" },
  discord: { slug: "discord", displayName: "Discord" },
  canva: { slug: "canva", displayName: "Canva" },
  "lemon squeezy": { slug: "lemon-squeezy", displayName: "Lemon Squeezy" },
  "google one": { slug: "google", displayName: "Google" },
  "google cloud": { slug: "google", displayName: "Google" },
  "dairy queen": { slug: "dairy-queen", displayName: "Dairy Queen" },
  "a&w": { slug: "a-and-w", displayName: "A&W" },
  shell: { slug: "shell", displayName: "Shell" },
  esso: { slug: "imperial-oil", displayName: "Imperial Oil" },
  "petro-canada": { slug: "petro-canada", displayName: "Petro-Canada" },
  "shoppers drug mart": {
    slug: "shoppers-drug-mart",
    displayName: "Shoppers Drug Mart",
  },
  "pocketpills pharmacy": { slug: "pocketpills", displayName: "PocketPills" },
  pocketpills: { slug: "pocketpills", displayName: "PocketPills" },
  "security national insurance": {
    slug: "security-national-insurance",
    displayName: "Security National Insurance",
  },
  "wealthsimple tax": { slug: "wealthsimple", displayName: "Wealthsimple" },
  "wealthsimple investments": {
    slug: "wealthsimple",
    displayName: "Wealthsimple",
  },
  capcut: { slug: "bytedance", displayName: "ByteDance" },
  steam: { slug: "valve", displayName: "Valve" },
  uniqlo: { slug: "fast-retailing", displayName: "Fast Retailing" },
  x: { slug: "x-corp", displayName: "X" },
  "x corp": { slug: "x-corp", displayName: "X" },
  twitter: { slug: "x-corp", displayName: "X" },
  zoho: { slug: "zoho", displayName: "Zoho" },
  "zoho workplace": { slug: "zoho", displayName: "Zoho" },
  nslsc: {
    slug: "national-student-loans-service-centre",
    displayName: "National Student Loans Service Centre",
  },
  "card payment": { slug: "cibc", displayName: "CIBC" },
  "internet transfer": { slug: "cibc", displayName: "CIBC" },
  "internet transfer card payment": { slug: "cibc", displayName: "CIBC" },
  "internet transfer to card": { slug: "cibc", displayName: "CIBC" },
  "loan payment": { slug: "cibc", displayName: "CIBC" },
  "payment protector": { slug: "cibc", displayName: "CIBC" },
  "payment protector premium": { slug: "cibc", displayName: "CIBC" },
  "payment protector insurance": { slug: "cibc", displayName: "CIBC" },
  "cibc payment protector": { slug: "cibc", displayName: "CIBC" },
  "credit adjustment": { slug: "cibc", displayName: "CIBC" },
  "credit memo": { slug: "cibc", displayName: "CIBC" },
  credit: { slug: "cibc", displayName: "CIBC" },
  cashback: { slug: "cibc", displayName: "CIBC" },
  "cashback / remise en argent": { slug: "cibc", displayName: "CIBC" },
  "cash advance": { slug: "cibc", displayName: "CIBC" },
  "cash advances": { slug: "cibc", displayName: "CIBC" },
  "interest reversal": { slug: "cibc", displayName: "CIBC" },
  "service charge": { slug: "cibc", displayName: "CIBC" },
  "annual fee": { slug: "cibc", displayName: "CIBC" },
  "annual fee rebate": { slug: "cibc", displayName: "CIBC" },
  cibc: { slug: "cibc", displayName: "CIBC" },
  "cibc loans": { slug: "cibc", displayName: "CIBC" },
  "cibc global money transfer": { slug: "cibc", displayName: "CIBC" },
  "global money transfer": { slug: "cibc", displayName: "CIBC" },
  "tax refund": {
    slug: "canada-revenue-agency",
    displayName: "Canada Revenue Agency",
  },
  "tps / gst credit": {
    slug: "canada-revenue-agency",
    displayName: "Canada Revenue Agency",
  },
  "tps/gst credit": {
    slug: "canada-revenue-agency",
    displayName: "Canada Revenue Agency",
  },
};

/**
 * Ordered pattern rules. Specific before broad.
 * Bank / transfer patterns cover description when merchantClean is generic.
 */
export const COMPANY_RULES: CompanyRule[] = [
  {
    company: { slug: "uber", displayName: "Uber" },
    patterns: [
      /uber\s*eats/i,
      /ubereats/i,
      /uber\s*canada\s*\/\s*ubereats/i,
      /uber\s*direct/i,
      /\buber\b/i,
    ],
  },
  {
    company: { slug: "cibc", displayName: "CIBC" },
    patterns: [
      /internet\s+transfer/i,
      /payment\s*thank\s*you/i,
      /paiement\s*merci/i,
      /card\s*payment/i,
      /preauthorized\s+debit\s+loan\s*payment/i,
      /\bloan\s*payment\b/i,
      /payment\s*protector/i,
      /credit\s*adjustment/i,
      /credit\s*memo/i,
      /cashback/i,
      /remise\s+en\s+argent/i,
      /cash\s*advances?/i,
      /interest\s*reversal/i,
      /service\s*charge/i,
      /annual\s*fee/i,
      /\bcibc\b/i,
      /\be-?\s*transfer\b/i,
      /pad\s+payment/i,
      /internet\s+bill\s*pay/i,
    ],
  },
  {
    company: { slug: "amazon", displayName: "Amazon" },
    patterns: [
      /amzn\s*mktp/i,
      /amazon\.ca/i,
      /amazon\.com/i,
      /\bamzn\b/i,
      /\bamazon\b/i,
      /\baudible\b/i,
    ],
  },
  {
    company: { slug: "tim-hortons", displayName: "Tim Hortons" },
    patterns: [/tim\s*horton/i],
  },
  {
    company: { slug: "mcdonalds", displayName: "McDonald's" },
    patterns: [/mcdonald/i, /\bgadc\b/i],
  },
  {
    company: { slug: "openai", displayName: "OpenAI" },
    patterns: [/openai/i, /chatgpt/i],
  },
  {
    company: { slug: "anthropic", displayName: "Anthropic" },
    patterns: [/anthropic/i, /claude\.ai/i],
  },
  {
    company: { slug: "codeium", displayName: "Codeium" },
    patterns: [/windsurf/i],
  },
  {
    company: { slug: "anysphere", displayName: "Anysphere" },
    patterns: [/\bcursor\b/i],
  },
  {
    company: { slug: "netflix", displayName: "Netflix" },
    patterns: [/netflix/i],
  },
  {
    company: { slug: "lyft", displayName: "Lyft" },
    patterns: [/\blyft\b/i, /citibik/i, /citi\s*bike/i],
  },
  {
    company: { slug: "videotron", displayName: "Videotron" },
    patterns: [/\bfizz\b/i, /videotron/i],
  },
  // Fuel before 7-Eleven (Esso inside 7-Eleven stores).
  {
    company: { slug: "shell", displayName: "Shell" },
    patterns: [/\bshell\b/i],
  },
  {
    company: { slug: "imperial-oil", displayName: "Imperial Oil" },
    patterns: [/\besso\b/i, /\bmobil\b/i],
  },
  {
    company: { slug: "petro-canada", displayName: "Petro-Canada" },
    patterns: [/petro[-\s]?canada/i],
  },
  {
    company: { slug: "7-eleven", displayName: "7-Eleven" },
    patterns: [/7[-\s]?eleven/i, /seven\s*eleven/i],
  },
  {
    company: { slug: "dairy-queen", displayName: "Dairy Queen" },
    patterns: [/dairy\s*queen/i, /\bdq\b.*#/i],
  },
  {
    company: { slug: "a-and-w", displayName: "A&W" },
    patterns: [/a\s*&\s*w/i, /\ba\s+and\s+w\b/i],
  },
  {
    company: { slug: "namecheap", displayName: "Namecheap" },
    patterns: [/name[-\s]?cheap/i],
  },
  {
    company: { slug: "vercel", displayName: "Vercel" },
    patterns: [/vercel/i],
  },
  {
    company: { slug: "discord", displayName: "Discord" },
    patterns: [/discord/i],
  },
  {
    company: { slug: "canva", displayName: "Canva" },
    patterns: [/\bcanva\b/i],
  },
  {
    company: { slug: "lemon-squeezy", displayName: "Lemon Squeezy" },
    patterns: [/lemon\s*squeezy/i, /lemosqzy/i, /lemsqzy/i],
  },
  {
    company: { slug: "google", displayName: "Google" },
    patterns: [/google\s*\*?google\s*one/i, /google\s*one/i, /google\s*cloud/i],
  },
  {
    company: { slug: "shoppers-drug-mart", displayName: "Shoppers Drug Mart" },
    patterns: [/shoppers?\s*drug\s*mart/i, /shoppersdrugmart/i],
  },
  {
    company: { slug: "pocketpills", displayName: "PocketPills" },
    patterns: [/pocket\s*pills/i],
  },
  {
    company: {
      slug: "security-national-insurance",
      displayName: "Security National Insurance",
    },
    patterns: [/security\s*national/i],
  },
  {
    company: { slug: "wealthsimple", displayName: "Wealthsimple" },
    patterns: [/wealthsimple/i],
  },
  {
    company: { slug: "bytedance", displayName: "ByteDance" },
    patterns: [/capcut/i],
  },
  {
    company: { slug: "valve", displayName: "Valve" },
    patterns: [/\bsteam\b/i],
  },
  {
    company: {
      slug: "canada-revenue-agency",
      displayName: "Canada Revenue Agency",
    },
    patterns: [/tax\s*refund/i, /tps\s*\/?\s*gst/i, /canada\s*revenue/i],
  },
  {
    company: { slug: "mbna", displayName: "MBNA" },
    patterns: [/\bmbna\b/i],
  },
];

/** Generic bank labels that must not become their own company via fallback. */
export const SKIP_COMPANY_FALLBACK = new Set(
  [
    "internet transfer",
    "card payment",
    "loan payment",
    "credit adjustment",
    "credit memo",
    "cashback",
    "cash advance",
    "cash advances",
    "interest reversal",
    "service charge",
    "annual fee",
    "annual fee rebate",
    "credit",
    "e-transfer",
    "payment protector",
    "payment protector premium",
    "payment thank you",
  ].map((s) => s.toLowerCase()),
);

export function resolveCompanyFromRules(blob: string): CompanyRef | null {
  for (const rule of COMPANY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(blob))) {
      return rule.company;
    }
  }
  return null;
}

export function resolveCompanyAlias(
  merchantClean: string | null | undefined,
): CompanyRef | null {
  if (!merchantClean?.trim()) return null;
  const key = merchantClean.trim().toLowerCase();
  if (COMPANY_ALIASES[key]) return COMPANY_ALIASES[key];
  // Internet Transfer to Card 4500***1654 etc.
  if (/^internet\s+transfer/i.test(key)) {
    return { slug: "cibc", displayName: "CIBC" };
  }
  if (/^e-?\s*transfer/i.test(key)) {
    return { slug: "cibc", displayName: "CIBC" };
  }
  if (/^payment\s*protector/i.test(key)) {
    return { slug: "cibc", displayName: "CIBC" };
  }
  return null;
}
