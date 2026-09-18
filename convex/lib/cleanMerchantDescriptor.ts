/**
 * Strip card-network junk from a statement line so charts show a merchant,
 * not "ALDO CEBU CITY 12,280.00 PHP @ 0.024".
 */

const CURRENCIES = [
  "AED",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "HKD",
  "INR",
  "JPY",
  "KRW",
  "MXN",
  "NZD",
  "PHP",
  "SGD",
  "THB",
  "USD",
  "VND",
] as const;

/** Kept upper-case only when the statement already printed them upper-case. */
const KEEP_ACRONYMS = new Set(["AWS", "DHL", "IBM", "LLC", "LTD", "PLC", "UPS"]);

/** Always upper-case, even when OCR/title-casing produced "Atm" or "Td". */
const FORCE_UPPER = new Set([
  "ABM",
  "ATB",
  "ATM",
  "BMO",
  "CIBC",
  "CPP",
  "CRA",
  "EFT",
  "EI",
  "GIC",
  "GST",
  "HSBC",
  "HST",
  "KFC",
  "LCBO",
  "LOC",
  "MBNA",
  "NAIT",
  "NSF",
  "NSLSC",
  "OAS",
  "POS",
  "RBC",
  "RESP",
  "RRSP",
  "TD",
  "TFSA",
  "USA",
]);

/** Brand spellings that title-casing gets wrong. Lower-case key → display. */
const BRAND_CASING: Record<string, string> = {
  chatgpt: "ChatGPT",
  doordash: "DoorDash",
  ebay: "eBay",
  github: "GitHub",
  iherb: "iHerb",
  linkedin: "LinkedIn",
  mcdonalds: "McDonald's",
  "mcdonald's": "McDonald's",
  openai: "OpenAI",
  paypal: "PayPal",
  petsmart: "PetSmart",
  pocketpills: "PocketPills",
  skipthedishes: "SkipTheDishes",
  tiktok: "TikTok",
  ualberta: "UAlberta",
  ubereats: "Uber Eats",
  youtube: "YouTube",
};

const SMALL_WORDS = new Set([
  "and",
  "at",
  "by",
  "da",
  "de",
  "del",
  "for",
  "la",
  "le",
  "of",
  "on",
  "the",
  "to",
  "van",
]);

const TRAILING_PLACES = [
  "quezon city",
  "cebu city",
  "davao city",
  "makati city",
  "cen bloc",
  "central bloc",
  "sm city",
  "ayala center",
  "ayala mall",
  "philippines",
  "united states",
  "lapu-lapu",
  "lapu lapu",
  "mandaluyong",
  "edmonton",
  "calgary",
  "toronto",
  "vancouver",
  "ottawa",
  "montreal",
  "winnipeg",
  "saskatoon",
  "halifax",
  "victoria",
  "manila",
  "makati",
  "taguig",
  "pasig",
  "davao",
  "mandaue",
  "iloilo",
  "bacolod",
  "cagayan",
  "cebu",
  "canada",
];

const PLACE_RE = new RegExp(
  `\\s+(?:${TRAILING_PLACES.map(escapeRe).join("|")})$`,
  "i",
);
/** Upper-case only so "on" the word never counts as Ontario. */
const PROVINCE_RE = /\s+(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/;

/** Payees whose name ends in a place word. Never strip these down. */
const PROTECTED_PLACE_NAMES = new Set([
  "air canada",
  "elections canada",
  "health canada",
  "parks canada",
  "revenue canada",
  "service canada",
  "transport canada",
]);

function stripTrailingPlaces(value: string) {
  let next = value;
  for (let step = 0; step < 6; step += 1) {
    if (PROTECTED_PLACE_NAMES.has(next.toLowerCase())) return next;
    const stripped = next
      .replace(PROVINCE_RE, "")
      .replace(PLACE_RE, "")
      .trim();
    if (!stripped || stripped === next) return next;
    next = stripped;
  }
  return next;
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CURRENCY_ALT = CURRENCIES.join("|");
const AMOUNT = String.raw`\d{1,3}(?:,\d{3})*(?:\.\d{2})?`;
const RATE = String.raw`@\s*[\d.,]+`;
const AMOUNT_CCY_FX = new RegExp(
  String.raw`\b(?:${AMOUNT}\s+(?:${CURRENCY_ALT})|(?:${CURRENCY_ALT})\s+${AMOUNT})(?:\s*${RATE})?`,
  "gi",
);
const BARE_RATE = new RegExp(String.raw`(?:^|\s)${RATE}(?=\s|$)`, "gi");

function stripFxBlocks(value: string) {
  return value.replace(AMOUNT_CCY_FX, " ").replace(BARE_RATE, " ");
}

/**
 * Statement "rails": how the money moved, not who got it. Two-word rails
 * (POS DEBIT, BILL PAYMENT, DIRECT DEP) are safe to strip with just a space
 * after them; one-word rails (PAYMENT, TRANSFER, DONATION) only when a dash,
 * colon, or slash separates them from the payee.
 */
const MULTI_WORD_RAIL = String.raw`pos\s+(?:debit|purchase|sale)|visa\s+debit|mastercard\s+debit|interac\s+(?:debit|purchase)|contactless\s+purchase|pre-?authori[sz]ed\s+(?:debit|payment)|online\s+(?:purchase|payment|banking(?:\s+payment)?|bill\s+pay(?:ment)?)|internet\s+bill\s+pay(?:ment)?|bill\s+pay(?:ment)?|direct\s+dep(?:osit)?|payroll\s+dep(?:osit)?|eft\s+(?:rent|payment|credit|debit|deposit|withdrawal)|(?:atm|abm|cash)\s+withdrawal|debit\s+card\s+purchase|point\s+of\s+sale(?:\s+purchase)?|e-?transfer\s+(?:sent|received)|recurring\s+payment|mobile\s+payment`;
const ONE_WORD_RAIL = String.raw`pos|visa|mastercard|interac|contactless|pad|eft|donation|e-?transfer|cheque|chq|payment|purchase|withdrawal|deposit|transfer`;

const RAIL_DASH = new RegExp(
  String.raw`^(${MULTI_WORD_RAIL}|${ONE_WORD_RAIL})\s*[-–—:/]+\s*`,
  "i",
);
const RAIL_SPACE = new RegExp(String.raw`^(${MULTI_WORD_RAIL})\s+`, "i");
/** The whole line is just a rail, e.g. "Pad" or "Online Purchase". */
const RAIL_ONLY = new RegExp(String.raw`^(${MULTI_WORD_RAIL}|pad)$`, "i");
const ATM_RAIL = /^(?:atm|abm|cash)\s+withdrawal$/i;

function stripPaymentRails(value: string): { value: string; rails: string[] } {
  let next = value;
  const rails: string[] = [];
  for (let step = 0; step < 4; step += 1) {
    const match = RAIL_DASH.exec(next) ?? RAIL_SPACE.exec(next);
    if (!match) break;
    const stripped = next.slice(match[0].length).trim();
    rails.push(match[1]!.replace(/\s+/g, " ").trim());
    next = stripped;
    if (!stripped) break;
  }
  if (!rails.length) {
    const only = RAIL_ONLY.exec(next);
    if (only) {
      rails.push(only[1]!.replace(/\s+/g, " ").trim());
      next = "";
    }
  }
  return { value: next, rails };
}

/** What to call a line when nothing but the rail survived ("Pad -"). */
function railLabel(rail: string) {
  const key = rail.toLowerCase();
  if (key === "pad" || key.startsWith("pre-authori") || key.startsWith("preauthori")) {
    return "Pre-Authorized Debit";
  }
  if (key.startsWith("direct dep")) return "Direct Deposit";
  if (ATM_RAIL.test(key)) return "ATM Withdrawal";
  return formatWords(rail);
}

/** Masked card/account numbers: 4500***1654, xxxx1234, **** 9559. */
const MASKED_NUMBER = /(?:\b\d+[*x]{2,}\s*\d*|[*x]{3,}\s*\d+)\b/gi;
/** Trailing account, ATM, or reference numbers: "TD 0816", "Savings 0092". */
const TRAILING_NUMBER = /(?:\s+(?:#\s*)?\d{4,})+$/;

function stripTrailingNumbers(value: string) {
  return value.replace(TRAILING_NUMBER, "").trim();
}

function stripRefsAndDomains(value: string) {
  return value
    .replace(MASKED_NUMBER, " ")
    .replace(/\*\s*[A-Za-z0-9]{4,}/g, " ")
    .replace(/(?:^|\s)\*(?:\s|$)/g, " ")
    .replace(/\bWWW\.[A-Za-z0-9.-]+/gi, " ")
    .replace(
      /\b[A-Za-z0-9][A-Za-z0-9.-]*\.(?:COM|NET|ORG|CA|IO|CO|PH|UK)\b/gi,
      " ",
    )
    .replace(/#\d{2,}/g, " ")
    .replace(/\bSTORE\s+\d+\b/gi, " ");
}

/** "PETRO-CANADA" → "Petro-Canada"; "HUDSON'S" → "Hudson's". */
function capitalizeShouting(word: string) {
  return word
    .split("-")
    .map((part) =>
      part ? part.charAt(0) + part.slice(1).toLowerCase() : part,
    )
    .join("-");
}

function formatWords(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      const brand = BRAND_CASING[lower];
      if (brand) return brand;
      if (FORCE_UPPER.has(word.toUpperCase())) return word.toUpperCase();
      if (index > 0 && SMALL_WORDS.has(lower)) {
        return lower;
      }
      if (
        KEEP_ACRONYMS.has(word.toUpperCase()) &&
        word === word.toUpperCase()
      ) {
        return word.toUpperCase();
      }
      if (word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return capitalizeShouting(word);
      }
      return word;
    })
    .join(" ");
}

export function cleanMerchantDescriptor(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  let value = raw.replace(/\s+/g, " ").trim();
  if (!value) return null;

  const first = stripPaymentRails(value);
  const rails = [...first.rails];
  value = stripRefsAndDomains(first.value);
  value = stripFxBlocks(value).replace(/\s+/g, " ").trim();
  const second = stripPaymentRails(value);
  rails.push(...second.rails);
  value = second.value;
  value = stripTrailingNumbers(value);
  value = stripTrailingPlaces(value).replace(/\s+/g, " ").trim();
  value = stripTrailingNumbers(value);
  value = value.replace(/[\\/,|;:–—-]+$/g, "").trim();

  // Nothing but the rail survived ("Pad -", "Online Purchase -"): name the rail.
  if (!value) {
    const rail = rails[0];
    return rail ? railLabel(rail) : null;
  }

  const payee = formatWords(value);
  // "Atm Withdrawal - TD 0816" → the bank whose machine it was.
  if (rails.some((rail) => ATM_RAIL.test(rail)) && !/\batm\b/i.test(payee)) {
    return `${payee} ATM`;
  }
  return payee;
}
