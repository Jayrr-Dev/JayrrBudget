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
  affirm: "Affirm",
  gocardless: "GoCardless",
  wealthsimple: "Wealthsimple",
  stripe: "Stripe",
  coinbase: "Coinbase",
  utilitek: "Utilitek",
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
  "st. albert",
  "st albert",
  "cornwall",
  "whyte",
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

const KNOWN_PAYEE: Array<[RegExp, string]> = [
  [/\bamzn(?:\s+mktp(?:lace)?)?\b/i, "Amazon"],
  [/\bzoho\b/i, "Zoho"],
  [/\b7-?\s*eleven(?:\s+store)?\b/i, "7-Eleven"],
  [/\baffirm\b/i, "Affirm"],
  [/\bgocardless\b/i, "GoCardless"],
  [/\bwealthsimple\b/i, "Wealthsimple"],
  [/\bstripe\b/i, "Stripe"],
  [/\bcoinbase\b/i, "Coinbase"],
  [/\butilitek\b/i, "Utilitek"],
  [/\bnslsc\b/i, "NSLSC"],
  [/\bmbna\b/i, "MBNA"],
  [/\bcibc\s+loans?\b/i, "CIBC Loans"],
  [/\bstud(?:e)?nt\s+loa/i, "Student Loan"],
];

function stripReferenceTokens(value: string) {
  return value
    .replace(/\bref[-–—:\s]*[a-z0-9]{4,}\b/gi, " ")
    .replace(/\bln\s*#\s*\d+\b/gi, " ")
    .replace(/\bfulfill\s+request\b/gi, " ")
    .replace(/\bcentree?dmonton\b/gi, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BANK_FEE =
  /\b(?:fee|fees|service charge|global money transfer)\b/i;

const BANK_IN_LINE: Array<[RegExp, string]> = [
  [/\bcibc\b|canadian imperial/i, "CIBC"],
  [/\btd\b|toronto[-\s]?dominion/i, "TD"],
  [/\brbc\b|royal bank/i, "RBC"],
  [/\bbmo\b|bank of montreal/i, "BMO"],
  [/scotia/i, "Scotiabank"],
];

/** "CIBC Internet Global Money Transfer Fee 36628" → "CIBC". */
function bankFeeName(value: string) {
  if (!BANK_FEE.test(value)) return null;
  for (const [pattern, name] of BANK_IN_LINE) {
    if (pattern.test(value)) return name;
  }
  return null;
}

function knownPayee(value: string) {
  for (const [pattern, name] of KNOWN_PAYEE) {
    if (pattern.test(value)) return name;
  }
  return null;
}

function payeeFromTransfer(value: string) {
  const internet = value.match(/^internet\s+transfer\b(?:\s+to\s+([a-z]+))?/i);
  if (internet) {
    const dest = internet[1];
    return dest ? `Internet Transfer to ${formatWords(dest)}` : "Internet Transfer";
  }
  const sent = value.match(/^(?:e-?transfer|interac(?:\s+e-?transfer)?)\b(.*)$/i);
  if (!sent) return null;
  const rest = (sent[1] ?? "").replace(/^[\s\-–—:/]+/, "").trim();
  if (!rest) return "E-Transfer";
  // "Out" / "In" is the direction, not a payee.
  if (/^(in|out)$/i.test(rest)) return null;
  if (/^(stop|network fee|fee|recall)$/i.test(rest)) {
    return `E-Transfer ${formatWords(rest)}`;
  }
  return formatWords(rest);
}

function stripFxBlocks(value: string) {
  return value.replace(AMOUNT_CCY_FX, " ").replace(BARE_RATE, " ");
}

/** CIBC spend column glued after the payee. Longest first. */
const SPEND_LABELS = [
  "professional and financial services",
  "personal and household expenses",
  "foreign currency transactions",
  "home and office improvement",
  "home & office improvement",
  "software and subscriptions",
  "health and education",
  "retail and grocery",
  "digital content",
  "transportation",
  "restaurants",
];

const SPEND_TAIL = SPEND_LABELS.map(
  (label) => new RegExp(String.raw`\s+${escapeRe(label)}$`, "i"),
);

/** Dollars with cents and no currency code: "14.70", "1,024.50". */
const BARE_AMOUNT = /\s+\d{1,3}(?:,\d{3})*\.\d{2}$/;
/** Province codes that are not also English words. */
const SAFE_PROVINCE = /\s+(?:AB|BC|MB|NB|NL|NS|NT|NU|PE|QC|SK|YT)$/i;
const LEGAL_SUFFIX = /\s+(?:corp|inc|ltd|llc)\.?$/i;
const SUBSCR_TAIL = /\s+subscr(?:iption)?$/i;
const COUNTRY_CA = /\s+ca$/i;
const CUTOFF_LETTER = /\s+&\s+[A-Za-z]$/;
const REFUND_PAREN = /\s*\(\s*refund\s*\)/gi;
const EMPTY_PAREN = /\(\s*\)/g;
const DOMAIN = /\b[a-z0-9][a-z0-9.-]*\.(?:com|net|org|ca|io|co|ph|uk)\b/gi;

const DOMAIN_BRAND: Record<string, string> = {
  amazon: "Amazon",
  amzn: "Amazon",
};

function endsWithPlace(value: string) {
  return PLACE_RE.test(value.trim());
}

/** "Cornwall on" is the city plus Ontario. "Pizza on" keeps the word. */
function stripOnProvince(value: string) {
  const match = value.match(/^(.*\S)\s+on$/i);
  if (!match?.[1]) return value;
  if (!endsWithPlace(match[1])) return value;
  return match[1].trim();
}

function collapseRepeatedBrand(value: string) {
  const match = value.match(/^(.+?)(?:-\1)+$/i);
  if (!match?.[1]) return value;
  return match[1].trim();
}

/**
 * Peel statement columns that got glued onto the payee:
 * amount, bank spend label, city, province, then leftover tokens.
 */
function peelStatementTail(value: string) {
  let next = value;
  for (let step = 0; step < 8; step += 1) {
    const before = next;
    REFUND_PAREN.lastIndex = 0;
    EMPTY_PAREN.lastIndex = 0;
    next = next.replace(BARE_AMOUNT, "").trim();
    for (const pattern of SPEND_TAIL) {
      if (!pattern.test(next)) continue;
      next = next.replace(pattern, "").trim();
      break;
    }
    next = next
      .replace(REFUND_PAREN, " ")
      .replace(EMPTY_PAREN, " ")
      .replace(/\s+/g, " ")
      .trim();
    next = next.replace(CUTOFF_LETTER, "").trim();
    next = next.replace(SUBSCR_TAIL, "").trim();
    next = next.replace(COUNTRY_CA, "").trim();
    const withoutProvince = next.replace(SAFE_PROVINCE, "").trim();
    next =
      withoutProvince === next ? stripOnProvince(next) : withoutProvince;
    next = stripTrailingPlaces(next).replace(/\s+/g, " ").trim();
    if (LEGAL_SUFFIX.test(next)) {
      const stripped = next.replace(LEGAL_SUFFIX, "").trim();
      if (stripped) next = stripped;
    }
    next = collapseRepeatedBrand(next);
    next = next.replace(/[\\/,|;:–—-]+$/g, "").trim();
    if (next === before) return next;
    if (!next) return "";
  }
  return next;
}

/** "Amazon.ca AMAZON.CA" → Amazon. A line with other words is left alone. */
function domainOnlyBrand(value: string): string | null {
  const domain = new RegExp(DOMAIN.source, "gi");
  const found = value.match(domain);
  if (!found || found.length === 0) return null;
  const rest = value
    .replace(new RegExp(DOMAIN.source, "gi"), " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
  if (rest) return null;
  const host = found[0].replace(/^www\./i, "");
  const label = host.split(".")[0] ?? "";
  if (!label) return null;
  return DOMAIN_BRAND[label.toLowerCase()] ?? formatWords(label);
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
  const domainBrand = domainOnlyBrand(first.value);
  if (domainBrand) return domainBrand;
  value = stripRefsAndDomains(first.value);
  value = stripFxBlocks(value).replace(/\s+/g, " ").trim();
  const second = stripPaymentRails(value);
  rails.push(...second.rails);
  value = second.value;
  value = stripTrailingNumbers(value);
  value = peelStatementTail(value).replace(/\s+/g, " ").trim();
  value = stripTrailingNumbers(value);
  value = stripReferenceTokens(value);
  value = value.replace(/[\\/,|;:–—-]+$/g, "").trim();
  const bankFee = bankFeeName(value);
  if (bankFee) return bankFee;
  const brand = knownPayee(value);
  if (brand) return brand;
  const transfer = payeeFromTransfer(value);
  if (transfer) return transfer;

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
