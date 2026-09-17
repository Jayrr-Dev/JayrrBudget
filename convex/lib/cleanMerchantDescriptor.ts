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

const KEEP_ACRONYMS = new Set([
  "AWS",
  "BMO",
  "CIBC",
  "DHL",
  "HSBC",
  "IBM",
  "LLC",
  "LTD",
  "MBNA",
  "NSLSC",
  "PLC",
  "RBC",
  "TD",
  "UPS",
  "USA",
]);

const SMALL_WORDS = new Set([
  "and",
  "at",
  "da",
  "de",
  "del",
  "la",
  "le",
  "of",
  "the",
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
  `(?:\\s+(?:${TRAILING_PLACES.map(escapeRe).join("|")}))+$`,
  "i",
);

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

const PAYMENT_RAIL_DASH =
  /^(?:pos(?:\s+(?:debit|purchase|sale))?|visa(?:\s+debit)?|mastercard(?:\s+debit)?|interac(?:\s+(?:debit|purchase))?|contactless(?:\s+purchase)?|pre-?authorized(?:\s+debit)?|pad|online\s+purchase)\s*[-–—:/]+\s*/i;
const PAYMENT_RAIL_SPACE =
  /^(?:pos\s+(?:debit|purchase|sale)|visa\s+debit|mastercard\s+debit|interac\s+(?:debit|purchase)|pre-?authorized\s+debit|online\s+purchase)\s+/i;

function stripPaymentRails(value: string) {
  let next = value;
  for (let step = 0; step < 4; step += 1) {
    const stripped = next
      .replace(PAYMENT_RAIL_DASH, "")
      .replace(PAYMENT_RAIL_SPACE, "")
      .trim();
    if (!stripped || stripped === next) break;
    next = stripped;
  }
  return next;
}

function stripRefsAndDomains(value: string) {
  return value
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

function formatWords(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
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
        return word.charAt(0) + word.slice(1).toLowerCase();
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

  value = stripPaymentRails(value);
  value = stripRefsAndDomains(value);
  value = stripFxBlocks(value).replace(/\s+/g, " ").trim();
  value = stripPaymentRails(value);
  value = value.replace(PLACE_RE, "").replace(/\s+/g, " ").trim();
  value = value.replace(/[\\/,|;]+$/g, "").trim();
  if (!value) return null;

  return formatWords(value);
}
