import { canonicalCategoryAiRules } from "@/domains/enrichment/domain/canonicalCategories";
import { MERCHANT_CLEAN_AI_RULES } from "@/domains/enrichment/domain/merchantCleanAiRules";
import {
  formatCategoryVocabularyForPrompt,
  type CategoryVocabulary,
} from "@/domains/statements/application/categoryVocabulary";
import {
  paperFactsParseProgress,
  type StatementImportProgress,
} from "@/domains/statements/domain/importProgress";
import {
  paperFactsMetaSchema,
  paperFactsStatementSchema,
  paperFactsToParsed,
  paperFactsTransactionSchemaFor,
  type PaperFactsStatementInput,
} from "@/domains/statements/domain/paperFactsStatement";
import {
  parsedStatementSchema,
  type ParsedStatement,
} from "@/domains/statements/domain/parsedStatement";
import { formatUserAiRulesPromptBlock } from "@/domains/statements/domain/userAiRules";
import { generateObjectWithFallback, mapPool } from "@/shared/ai/openRouter";
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

const paperFactsLineSchema = paperFactsTransactionSchemaFor({
  location: false,
  fx: false,
});
const paperFactsBatchSchema = z.object({
  transactions: z.array(paperFactsLineSchema),
});

const cleanPageSchema = z.object({
  markdown: z
    .string()
    .min(1)
    .describe(
      "One short header line, then a markdown table of posted lines. No legal copy.",
    ),
});

/**
 * Turn a raw OCR page into a short header plus a transaction table.
 * Falls back to the original page text if the cleanup call fails.
 */
export async function cleanOcrToTable(ocrMarkdown: string): Promise<string> {
  const pages = splitOcrPages(ocrMarkdown);
  const cleaned = await mapPool(pages, 2, async (pageText, index) => {
    try {
      const { object } = await generateObjectWithFallback({
        schema: cleanPageSchema,
        logLabel: "statements-ocr-clean",
        temperature: 0,
        prompt: [
          "Rewrite this bank-statement OCR into clean text before anyone extracts transactions.",
          "First line: institution, account, period, opening balance, withdrawals, deposits, closing balance. Omit any of those that are not on the page.",
          "Then a markdown table with columns: Date | Description | Withdrawal | Deposit | Balance.",
          "One posted line per row. Join a wrapped payee onto the line above it.",
          "Keep amounts exactly as printed. Do not invent rows.",
          "Drop legal paragraphs, phone numbers, websites, branch addresses, ads, and page numbers.",
          "Drop spend-category recaps that repeat the same lines.",
          `This is page ${index + 1} of ${pages.length}.`,
          "",
          pageText.slice(0, 40_000),
        ].join("\n"),
      });
      const body = object.markdown.trim();
      if (!body.includes("|")) {
        return `## Page ${index + 1}\n\n${pageText.trim()}`;
      }
      return `## Page ${index + 1}\n\n${body}`;
    } catch (error) {
      console.warn(
        `[statements-ocr-clean] page ${index + 1} kept raw: ${
          error instanceof Error ? error.message : "cleanup failed"
        }`,
      );
      return `## Page ${index + 1}\n\n${pageText.trim()}`;
    }
  });
  return cleaned.join("\n\n");
}

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
  "LEDGER SIGNS (same for every account type):",
  "Positive = money leaving the customer (purchase, fee, PAD, ATM, transfer out, interest charged).",
  "Negative = money arriving (payroll, deposit, refund, credit, card payment, e-Transfer in).",
  "Chequing/savings: a withdrawal that LOWERS cash is still POSITIVE. Do not copy the running-balance column sign.",
  "Credit card / LOC: a purchase that RAISES amount owing is POSITIVE. A payment is NEGATIVE.",
  "BALANCE: cards/LOC: openingBalance + sum(amounts) = closingBalance (±0.02).",
  "BALANCE: checking, chequing, or savings: openingBalance - sum(amounts) = closingBalance (±0.02).",
].join("\n");

const LINE_DEDUP_RULES = [
  "CRITICAL: Credit cards often list TWO dates per line: Trans date and Post date. US and Canadian statements both do this.",
  "Emit ONE transaction per statement LINE. Never create two rows for the same line.",
  "Same amount + same description + same Post date = one row, even if OCR repeated it.",
  "date = Post date as YYYY-MM-DD. authorizedDate = Trans date as YYYY-MM-DD (null only if absent).",
  "Never use month-day text like 'Jul 24'. Always use YYYY-MM-DD with the statement year.",
  "Skip CreditSmart / spend-category summary tables, payment slips, ads, and page footers.",
  "Skip section total rows (Total payments, Total for card, etc.).",
  "Many checking and chequing PDFs print the daily register, then a later recap of the SAME lines. Extract the register once.",
  "Never emit a description that is only a date ('Jan 01', 'January 1'). That is the date column, not a payee.",
  "openingBalance = Previous balance. closingBalance = Total balance / New balance.",
  "Strip OCR dingbats (arrows, stars, warning marks) from description.",
  "WRAPPED LINES: statements often print the rail on one OCR line and the payee on the next ('ONLINE PURCHASE -' then 'AMAZON'; 'ACH -' then 'SPOTIFY'; 'BILL PAYMENT -' then 'VISA'). Join them into ONE description.",
  "A description must name who was paid when the statement does. Never emit a description that is only a rail ('PAD -', 'ONLINE PURCHASE -', 'BILL PAYMENT -') or that ends with a dash; look at the neighbouring OCR line for the payee first.",
  "Keep FX notes like 'USD 12.00 @ 1.42' in description.",
];

const DEDUP_AND_META_RULES = [
  ...LINE_DEDUP_RULES,
  "totalDebits = purchases/charges total when shown. totalCredits = payments/credits total when shown.",
  "Keep FX notes like 'USD 12.00 @ 1.42' or '5,275.00 PHP' in description, and ALSO fill foreignAmount, foreignCurrency, and exchangeRate when present.",
  "amount is always the statement currency. Never copy a PHP, USD, or EUR face value into amount. When a rate is printed, amount = foreignAmount × exchangeRate.",
  MERCHANT_CLEAN_AI_RULES,
].join("\n");

const MASK_RULES = [
  "accountMask = last 4 digits of the PRODUCT, not a random number on the page.",
  "CIBC Visa/Mastercard: last 4 of the CARD NUMBER (16-digit PAN / 'ending in'). Never the shorter customer or statement number.",
  "Chequing: last 4 of the account number (e.g. 55-192 → 5192).",
  "LOC: last 4 of the LOC account number (e.g. 52839 → 2839).",
].join("\n");

const CATEGORY_HARD_RULES = [
  canonicalCategoryAiRules(),
  "PAYMENT THANK YOU / PAIEMENT MERCI / PAD to a CIBC card → section Transfers, category Account Transfers, subcategory Credit Card Payoffs, transactionCode payment.",
  "INTERNET TRANSFER (plain, no GLOBAL, no person name) → Transfers / Account Transfers / Self Transfers. Not spending.",
  "INTERNET GLOBAL MONEY TRANSFER / remittance / PHP → Transfers / External Transfers / Remittances. Real money out.",
  "E-TRANSFER + a person's name → Transfers / External Transfers / Interac e-Transfer. Out is spend; in is income.",
  "CHEQUE # / CHEQUE … CLEARED THROUGH TRANSIT → Transfers / External Transfers / Cheques. Money to someone else, not a self-transfer.",
  "WIRE TRANSFER / bank wire → Transfers / External Transfers / Wire Transfers.",
  "PREAUTHORIZED DEBIT student loan / ABDL / BNPL → Finance / Loans / Student Loans.",
  "OpenAI, ChatGPT, T3 Chat, Cursor, Anthropic → Technology / AI Services / Assistants.",
  "Wealthsimple Tax → Technology / Software / Productivity.",
  "Movati, GoodLife, gym memberships → Lifestyle / Personal Care / Gym Memberships. Recurring gym PAD → transactionCode subscription.",
  "Uber Eats → Food / Delivery / Food Delivery. Uber Holdings / Uber trip (no Eats) → Transport / Rideshare.",
  "Airline / airfare / Trip.com / booking.com flights → Travel / Flights. Hotels / Airbnb → Travel / Lodging. Theme parks and paid tours → Travel / Attractions.",
  "Daycare, babysitting, kids clothing, PetSmart, vet → Family. Do not put trip hotels under Lifestyle or daily Uber under Travel.",
  "LCBO / beer store / wine shop → Food / Alcohol. Bar, pub, nightclub tab → Lifestyle / Entertainment / Bars.",
  "Audible, Kindle, bookstore → Development / Books. NAIT / tuition / courses → Development / Education. Gym class → Lifestyle / Fitness.",
  "Never emit Travel as a category or a tag. Travel is a section only.",
  "Esso / Shell / Petro-Canada, even with 7-Eleven on the same line → Transport / Fuel / Gas Stations.",
  "Plain 7-Eleven with no fuel brand → Food / Groceries / Convenience Store.",
  "Netflix, Spotify, Disney+, Crave, and similar recurring digital charges → transactionCode subscription.",
  "If no existing subcategory fits, emit a new short Title Case subcategory under an existing category. Never leave subcategory empty.",
  "Purchase refunds (Amazon CREDIT, return) stay under the original tree, transactionCode refund. Never Income.",
].join("\n");

const BALANCE_AND_DEDUP_RULES = [
  SIGN_AND_BALANCE_RULES,
  DEDUP_AND_META_RULES,
  MASK_RULES,
  CATEGORY_HARD_RULES,
].join("\n");

/** Paper-facts extract: ledger math + line text only (no categories / merchants). */
function paperFactsRules() {
  return [
    SIGN_AND_BALANCE_RULES,
    LINE_DEDUP_RULES.join("\n"),
    MASK_RULES,
    "Do NOT invent categories, subcategories, paymentChannel, merchantName, location, or transactionCode.",
    "Fill date, authorizedDate, description, amount, pending only.",
    "Keep FX notes like `USD 12.00 @ 1.42` inside description. Do not add extra FX fields.",
    "Keep description as the full original statement line (minus OCR dingbats).",
  ].join("\n");
}

function sourceHintBlock(sourceHint?: string) {
  if (!sourceHint?.trim()) return [];
  return [
    `SOURCE HINT (folder/filename; use this for accountType and accountMask when OCR is ambiguous): ${sourceHint.trim()}`,
  ];
}

/** Fast rich parse with a reliable model chain and page batching for long PDFs. */
export async function parseStatementWithOpenRouter(
  ocrMarkdown: string,
  options?: {
    vocabulary?: CategoryVocabulary;
    sourceHint?: string;
  },
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
        "Extract a rich structured ledger from this bank or credit-card OCR. US and Canadian statements both count.",
        "Extract EVERY posted transaction line.",
        "Currency is the ISO code on the statement. A US bank is USD. A Canadian bank is CAD. Do not assume CAD.",
        "accountType (pick one): checking|chequing, savings, credit|credit_card (Visa/Mastercard/Amex), lending|line_of_credit (LOC/HELOC/loan), other.",
        ...hintBlock,
        BALANCE_AND_DEDUP_RULES,
        "Keep description as full original text (minus dingbats).",
        "Fill categories, paymentChannel, transactionCode, city/region, foreignAmount/foreignCurrency/exchangeRate when present.",
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
      "Extract statement metadata only from this bank or credit-card OCR.",
      "No transactions.",
      "Currency is the ISO code on the statement. A US bank is USD. A Canadian bank is CAD. Do not assume CAD.",
      "accountType (pick one): checking|chequing, savings, credit|credit_card, lending|line_of_credit, other.",
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
        "US or Canadian bank or credit-card statement.",
        ...hintBlock,
        BALANCE_AND_DEDUP_RULES,
        "Keep description as full original text (minus dingbats).",
        "Fill category, paymentChannel, transactionCode, city/region, foreignAmount/foreignCurrency/exchangeRate when present.",
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
  options?: {
    vocabulary?: CategoryVocabulary;
    sourceHint?: string;
  },
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
      `transactionSum=${balance.transactionSum} (positive = money out)`,
      `computedClosing=${balance.computedClosing}`,
      `delta=${balance.delta} (computedClosing - closingBalance).`,
      "Likely cause: duplicate Trans/Post rows, missing/extra lines, or amounts copied from the running-balance column.",
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

/**
 * Paper-facts parse: dates, description, amounts, account meta.
 * Uses the Service model chain from Convex (same as chat).
 * Pages run in parallel. Location/FX are filled in polish, not by the model.
 * Optional owner preferences apply only to this PDF extract (never other AI paths).
 */
export async function parseStatementPaperFacts(
  ocrMarkdown: string,
  options?: {
    sourceHint?: string;
    userRules?: string[];
    onProgress?: (progress: StatementImportProgress) => void;
  },
): Promise<ParsedStatement> {
  const pages = splitOcrPages(ocrMarkdown);
  const started = Date.now();
  const hintBlock = sourceHintBlock(options?.sourceHint);
  const userBlock = formatUserAiRulesPromptBlock(options?.userRules);
  const rules = paperFactsRules();
  const pageCount = pages.length;
  let pagesDone = 0;
  let lastProgress = paperFactsParseProgress({
    pageCount,
    pagesDone: 0,
    label:
      pageCount === 1
        ? "Reading lines…"
        : `Reading lines on ${pageCount} pages…`,
  });
  const emit = (progress: StatementImportProgress) => {
    lastProgress = progress;
    options?.onProgress?.(progress);
  };
  emit(lastProgress);
  const beat = setInterval(() => {
    const waited = Math.round((Date.now() - started) / 1000);
    if (waited < 8) return;
    options?.onProgress?.({
      ...lastProgress,
      label: `${lastProgress.label.replace(/ · \d+s$/, "")} · ${waited}s`,
    });
  }, 8_000);

  const preview = ocrMarkdown.slice(0, 24_000);

  try {
    const metaPromise = generateObjectWithFallback({
      schema: paperFactsMetaSchema,
      logLabel: "statements-paper-meta",
      prompt: [
        "Extract statement metadata only from this bank or credit-card OCR.",
        "No transactions.",
        "Currency is the ISO code on the statement. A US bank is USD. A Canadian bank is CAD. Do not assume CAD.",
        "accountType (pick one): checking|chequing, savings, credit|credit_card, lending|line_of_credit, other.",
        ...hintBlock,
        MASK_RULES,
        "openingBalance = Previous balance. closingBalance = Total balance / New balance.",
        "Fill statementPeriodStart/End when present.",
        ...userBlock,
        "",
        preview,
      ].join("\n"),
    });

    const pageResults = await mapPool(pages, 4, async (pageText, index) => {
      emit(
        paperFactsParseProgress({
          pageCount,
          pagesDone,
          label: `Reading page ${index + 1} of ${pageCount}…`,
        }),
      );
      const { object } = await generateObjectWithFallback({
        schema: paperFactsBatchSchema,
        logLabel: "statements-paper-page",
        prompt: [
          "Extract EVERY posted transaction LINE on this statement page OCR.",
          "US or Canadian bank or credit-card statement.",
          ...hintBlock,
          rules,
          ...userBlock,
          `This is page ${index + 1} of ${pageCount}.`,
          pageText.slice(0, 40_000),
        ].join("\n"),
      });

      pagesDone += 1;
      emit(
        paperFactsParseProgress({
          pageCount,
          pagesDone,
          label: `Read page ${index + 1} of ${pageCount} · ${object.transactions.length} lines`,
        }),
      );
      return object.transactions;
    });

    const { object: meta } = await metaPromise;
    emit(
      paperFactsParseProgress({
        pageCount,
        pagesDone: pageCount,
        label: "Checking balances…",
      }),
    );
    const paper: PaperFactsStatementInput = {
      ...meta,
      transactions: pageResults.flat(),
    };

    console.info(
      `[statements] paper-facts ${paper.transactions.length} txns across ${pageCount} pages in ${Date.now() - started}ms`,
    );

    return paperFactsToParsed(paper);
  } finally {
    clearInterval(beat);
  }
}

/** Extra read when opening plus the lines do not match closing. */
export async function rebalancePaperFacts(
  ocrMarkdown: string,
  parsed: ParsedStatement,
  balance: {
    openingBalance: number | null;
    closingBalance: number | null;
    transactionSum: number;
    computedClosing: number | null;
    delta: number | null;
  },
  signs?: string,
  attempt = 1,
): Promise<ParsedStatement> {
  const { object } = await generateObjectWithFallback({
    schema: paperFactsStatementSchema,
    logLabel: "statements-paper-rebalance",
    temperature: 0,
    prompt: [
      `Correction ${attempt} of 3. The extract still does not balance. Read the table again and return the full statement.`,
      "Sign comes from the Balance column, not the Withdrawal or Deposit heading.",
      "If the balance went up, amount is negative (money in). If it went down, amount is positive (money out).",
      "A foreign figure is foreignAmount, not the statement-currency amount. amount = foreignAmount × exchangeRate in the statement currency. USD is foreign on a Canadian statement. CAD is foreign on a US statement.",
      "Skip Opening balance and Balance forward rows. They are not transactions.",
      "Keep reference numbers in the description. Two transfers of the same amount on the same day are both real when a reversal sits between them.",
      "openingBalance and closingBalance come from the statement header, not a mid-statement balance.",
      "Chequing, checking, or savings: opening - sum(amounts) = closing. Card: opening + sum(amounts) = closing.",
      "Positive amount = money out. Do not invent lines.",
      signs
        ? "JEV LABELS. Trust these over the table columns. withdrawal = positive amount. deposit = negative amount. skip = do not emit that row. distinct = keep the row even if another line has the same day and amount. duplicate = emit that movement once. amount=balance_change means use the balance change in the statement currency. amount=12.50 means that printed figure is the statement-currency amount."
        : "",
      signs ? signs : "",
      `accountType=${parsed.accountType}`,
      `openingBalance=${balance.openingBalance}`,
      `closingBalance=${balance.closingBalance}`,
      `transactionSum=${balance.transactionSum}`,
      `computedClosing=${balance.computedClosing}`,
      `delta=${balance.delta} (computedClosing - closingBalance).`,
      "TABLE:",
      ocrMarkdown.slice(0, 80_000),
      "PREVIOUS:",
      JSON.stringify({
        openingBalance: parsed.openingBalance,
        closingBalance: parsed.closingBalance,
        transactions: parsed.transactions.map((txn) => ({
          date: txn.date,
          description: txn.description,
          amount: txn.amount,
        })),
      }).slice(0, 40_000),
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return paperFactsToParsed(object);
}
