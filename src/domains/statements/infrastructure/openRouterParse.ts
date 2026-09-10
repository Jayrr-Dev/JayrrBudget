import { generateObjectWithFallback, mapPool } from "@/shared/ai/openRouter";
import {
  formatCategoryVocabularyForPrompt,
  type CategoryVocabulary,
} from "@/domains/statements/application/categoryVocabulary";
import {
  parsedStatementSchema,
  type ParsedStatement,
} from "@/domains/statements/domain/parsedStatement";
import { z } from "zod";

export {
  getModelChain,
  getParseModelChain,
  isOpenRouterConfigured,
} from "@/shared/ai/openRouter";

const statementMetaSchema = parsedStatementSchema.omit({ transactions: true });

const transactionBatchSchema = z.object({
  transactions: parsedStatementSchema.shape.transactions,
});

function splitOcrPages(ocrMarkdown: string) {
  const parts = ocrMarkdown
    .split(/^## Page \d+\s*$/gim)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [ocrMarkdown];
}

function categoryPromptBlock(vocabulary?: CategoryVocabulary) {
  if (!vocabulary) return [];
  return ["", formatCategoryVocabularyForPrompt(vocabulary), ""];
}

const SIGN_AND_BALANCE_RULES = [
  "LEDGER SIGNS (Plaid, same for every account type):",
  "Positive = money leaving the customer (purchase, fee, PAD, ATM, transfer out, interest charged).",
  "Negative = money arriving (payroll, deposit, refund, credit, card payment, e-Transfer in).",
  "Chequing/savings: a withdrawal that LOWERS cash is still POSITIVE. Do not copy the running-balance column sign.",
  "Credit card / LOC: a purchase that RAISES amount owing is POSITIVE. A payment is NEGATIVE.",
  "BALANCE — cards/LOC: openingBalance + sum(amounts) = closingBalance (±0.02).",
  "BALANCE — chequing/savings: openingBalance - sum(amounts) = closingBalance (±0.02).",
].join("\n");

const DEDUP_AND_META_RULES = [
  "CRITICAL — Canadian credit cards (CIBC Visa etc.) list TWO dates per line: Trans date and Post date.",
  "Emit ONE transaction per statement LINE. Never create two rows for the same line.",
  "Same amount + same description + same Post date = one row, even if OCR repeated it.",
  "date = Post date as YYYY-MM-DD. authorizedDate = Trans date as YYYY-MM-DD (null only if absent).",
  "Never use month-day text like 'Jul 24' — always YYYY-MM-DD with the statement year.",
  "Skip CreditSmart / spend-category summary tables, payment slips, ads, and page footers.",
  "Skip section total rows (Total payments, Total for card, etc.).",
  "openingBalance = Previous balance. closingBalance = Total balance / New balance.",
  "totalDebits = purchases/charges total when shown. totalCredits = payments/credits total when shown.",
  "Strip OCR dingbats (arrows, stars, warning marks) from description and merchantName.",
  "Keep FX notes like 'USD 12.00 @ 1.42' in description; merchantName stays the brand.",
].join("\n");

const MASK_RULES = [
  "accountMask = last 4 digits of the PRODUCT, not a random number on the page.",
  "CIBC Visa/Mastercard: last 4 of the CARD NUMBER (16-digit PAN / 'ending in'). Never the shorter customer or statement number.",
  "Chequing: last 4 of the account number (e.g. 55-192 → 5192).",
  "LOC: last 4 of the LOC account number (e.g. 52839 → 2839).",
].join("\n");

const CATEGORY_HARD_RULES = [
  "PAYMENT THANK YOU / PAIEMENT MERCI / PAD to a CIBC card → categoryDetailed Credit Card Payment, transactionCode payment. Never Transfer, never Payment Protection.",
  "OpenAI, ChatGPT, T3 Chat, Cursor, Anthropic, Wealthsimple Tax → SaaS (not Software and Subscriptions).",
  "Movati, GoodLife, gym memberships → Gyms / ENTERTAINMENT (not Personal Care).",
  "Uber Eats → Restaurants. Uber Holdings / Uber trip (no Eats) → Rideshare.",
  "Esso / Shell / Petro-Canada, even with 7-Eleven on the same line → Gas Stations.",
  "Plain 7-Eleven with no fuel brand → Convenience Store (or Groceries only if the line is clearly food-only).",
].join("\n");

const BALANCE_AND_DEDUP_RULES = [
  SIGN_AND_BALANCE_RULES,
  DEDUP_AND_META_RULES,
  MASK_RULES,
  CATEGORY_HARD_RULES,
].join("\n");

function sourceHintBlock(sourceHint?: string) {
  if (!sourceHint?.trim()) return [];
  return [
    `SOURCE HINT (folder/filename — use this for accountType and accountMask when OCR is ambiguous): ${sourceHint.trim()}`,
  ];
}

/** Fast rich parse with a reliable model chain and page batching for long PDFs. */
export async function parseStatementWithOpenRouter(
  ocrMarkdown: string,
  options?: { vocabulary?: CategoryVocabulary; sourceHint?: string },
): Promise<ParsedStatement> {
  const pages = splitOcrPages(ocrMarkdown);
  const started = Date.now();
  const vocabulary = options?.vocabulary;
  const categoryBlock = categoryPromptBlock(vocabulary);
  const hintBlock = sourceHintBlock(options?.sourceHint);

  if (pages.length <= 2) {
    const { object } = await generateObjectWithFallback({
      schema: parsedStatementSchema,
      logLabel: "statements",
      prompt: [
        "Extract a rich structured ledger from this Canadian bank/credit-card OCR.",
        "Extract EVERY posted transaction line. Prefer CAD.",
        "accountType (pick one): chequing|checking, savings, credit|credit_card (Visa/Mastercard/Amex), lending|line_of_credit (LOC/HELOC/loan), other (TFSA/business/unclear).",
        ...hintBlock,
        BALANCE_AND_DEDUP_RULES,
        "Keep description as full original text (minus dingbats); merchantName = cleaned brand.",
        "Fill categories, paymentChannel, transactionCode, city/region, foreign amounts when present.",
        ...categoryBlock,
        ocrMarkdown.slice(0, 120_000),
      ].join("\n"),
    });

    console.info(
      `[statements] single-pass ${object.transactions.length} txns in ${Date.now() - started}ms`,
    );
    return object;
  }

  const preview = ocrMarkdown.slice(0, 24_000);

  const metaPromise = generateObjectWithFallback({
    schema: statementMetaSchema,
    logLabel: "statements-meta",
    prompt: [
      "Extract statement metadata only from this Canadian bank/credit-card OCR.",
      "No transactions. Prefer CAD.",
      "accountType (pick one): chequing|checking, savings, credit|credit_card, lending|line_of_credit, other.",
      ...hintBlock,
      MASK_RULES,
      "openingBalance = Previous balance. closingBalance = Total balance / New balance.",
      "Fill statementPeriodStart/End, totalDebits, totalCredits when present.",
      "",
      preview,
    ].join("\n"),
  });

  const pageResults = await mapPool(pages, 2, async (pageText, index) => {
    const { object } = await generateObjectWithFallback({
      schema: transactionBatchSchema,
      logLabel: "statements-page",
      prompt: [
        "Extract EVERY posted transaction LINE on this statement page OCR.",
        "Canadian bank/credit card statement (often CIBC Visa).",
        ...hintBlock,
        BALANCE_AND_DEDUP_RULES,
        "Keep description as full original text (minus dingbats).",
        "merchantName = cleaned merchant without city noise.",
        "Fill category, paymentChannel, transactionCode, city/region, foreign amounts when present.",
        `This is page ${index + 1} of ${pages.length}.`,
        ...categoryBlock,
        pageText.slice(0, 40_000),
      ].join("\n"),
    });

    return object.transactions;
  });

  const { object: meta } = await metaPromise;
  const transactions = pageResults.flat();

  console.info(
    `[statements] parsed ${transactions.length} txns across ${pages.length} pages in ${Date.now() - started}ms`,
  );

  return {
    ...meta,
    transactions,
  };
}

/** One correction pass when opening + txns do not match closing. */
export async function rebalanceParsedStatement(
  ocrMarkdown: string,
  parsed: ParsedStatement,
  balance: {
    openingBalance: number | null;
    closingBalance: number | null;
    transactionSum: number;
    computedClosing: number | null;
    delta: number | null;
  },
  options?: { vocabulary?: CategoryVocabulary; sourceHint?: string },
): Promise<ParsedStatement> {
  const categoryBlock = categoryPromptBlock(options?.vocabulary);
  const hintBlock = sourceHintBlock(options?.sourceHint);
  const { object } = await generateObjectWithFallback({
    schema: parsedStatementSchema,
    logLabel: "statements-rebalance",
    prompt: [
      "Your previous extract does NOT balance. Fix the transaction list.",
      BALANCE_AND_DEDUP_RULES,
      ...hintBlock,
      `accountType=${parsed.accountType}`,
      `openingBalance=${balance.openingBalance}`,
      `closingBalance=${balance.closingBalance}`,
      `transactionSum=${balance.transactionSum} (Plaid: positive = money out)`,
      `computedClosing=${balance.computedClosing}`,
      `delta=${balance.delta} (computedClosing - closingBalance).`,
      "Likely cause: duplicate Trans/Post rows, missing/extra lines, or chequing amounts copied from the running-balance column.",
      "Return the FULL corrected statement object (metadata + unique posted transactions).",
      "Keep institution/account/period metadata unless clearly wrong.",
      ...categoryBlock,
      "OCR:",
      ocrMarkdown.slice(0, 100_000),
      "PREVIOUS_JSON:",
      JSON.stringify({
        ...parsed,
        transactions: parsed.transactions.slice(0, 200),
      }).slice(0, 60_000),
    ].join("\n"),
  });

  return object;
}
