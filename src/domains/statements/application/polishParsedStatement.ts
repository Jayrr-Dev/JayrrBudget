import { normalizeStatementAccountType } from "@/domains/dashboard/domain/accountCategory";
import { resolveAccountMask } from "@/domains/statements/application/accountMask";
import {
  normalizeParsedCategories,
} from "@/domains/statements/application/normalizeParsedCategories";
import type { CategoryVocabulary } from "@/domains/statements/application/categoryVocabulary";
import type { ParsedStatement } from "@/domains/statements/domain/parsedStatement";

type ParsedTxn = ParsedStatement["transactions"][number];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const OCR_JUNK = /[\u00a0]/g;
const DINGBATS = /[\u2190-\u21ff\u2600-\u27bf\u2b00-\u2bff❗↑↓•●★☆✓✔✕✖♦♥♣♠]/g;

export function cleanStatementLine(text: string): string {
  return text
    .replace(OCR_JUNK, " ")
    .replace(DINGBATS, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function blob(txn: Pick<ParsedTxn, "description" | "merchantName">) {
  return `${txn.merchantName ?? ""} ${txn.description}`;
}

type CategoryFix = {
  test: (text: string) => boolean;
  section: string;
  category: string;
  subcategory: string;
  transactionCode?: ParsedTxn["transactionCode"];
};

const CATEGORY_FIXES: CategoryFix[] = [
  {
    test: (text) =>
      /payment\s*thank\s*you/i.test(text) ||
      /paiement\s*merci/i.test(text) ||
      /pad\s+payment.{0,40}card/i.test(text) ||
      /internet\s+bill\s*pay.{0,40}card/i.test(text) ||
      /cibc\s+card\s+payment/i.test(text),
    section: "Transfers",
    category: "Account Transfers",
    subcategory: "Credit Card Payoffs",
    transactionCode: "payment",
  },
  {
    test: (text) =>
      /movati/i.test(text) ||
      /goodlife/i.test(text) ||
      /anytime\s*fitness/i.test(text) ||
      /\bgym\b/i.test(text),
    section: "Lifestyle",
    category: "Personal Care",
    subcategory: "Gym Memberships",
  },
  {
    test: (text) =>
      /openai/i.test(text) ||
      /chatgpt/i.test(text) ||
      /\bt3\s*chat\b/i.test(text) ||
      /anthropic/i.test(text) ||
      /\bcursor\b/i.test(text),
    section: "Technology",
    category: "AI Services",
    subcategory: "AI Assistants & Chat",
  },
  {
    test: (text) => /wealthsimple\s*tax/i.test(text),
    section: "Technology",
    category: "Software",
    subcategory: "Productivity & Creative",
  },
  {
    test: (text) =>
      /\besso\b/i.test(text) ||
      /\bshell\b/i.test(text) ||
      /petro[-\s]?canada/i.test(text),
    section: "Transport",
    category: "Fuel",
    subcategory: "Gas Stations",
  },
  {
    test: (text) =>
      /studnt\s*loa/i.test(text) ||
      /student\s*ln/i.test(text) ||
      /abdl\s*student/i.test(text) ||
      /buy\s*now\s*pay\s*later/i.test(text) ||
      /\bbnpl\b/i.test(text),
    section: "Finance",
    category: "Debt & Loans",
    subcategory: "Student Loans",
  },
  {
    test: (text) =>
      /global\s+money\s+transfer/i.test(text) ||
      /internet\s+global\s+money/i.test(text),
    section: "Transfers",
    category: "External Transfers",
    subcategory: "Remittances",
  },
  {
    test: (text) => /e-?transfer/i.test(text),
    section: "Transfers",
    category: "External Transfers",
    subcategory: "Interac e-Transfer",
  },
  {
    test: (text) => /^internet\s+transfer\b/i.test(text),
    section: "Transfers",
    category: "Account Transfers",
    subcategory: "Self Transfers",
    transactionCode: "transfer",
  },
  {
    test: (text) => /uber\s*eats|ubereats/i.test(text),
    section: "Food",
    category: "Delivery",
    subcategory: "Food Delivery",
  },
  {
    test: (text) =>
      /air\s*canada|westjet|porter\s*air|trip\.com|cheap\s*tickets|airline|airfare/i.test(
        text,
      ),
    section: "Travel",
    category: "Flights",
    subcategory: "Airline Tickets",
  },
  {
    test: (text) =>
      /airbnb|booking\.com|marriott|hilton|holiday\s*inn|hotel/i.test(text),
    section: "Travel",
    category: "Lodging",
    subcategory: "Hotels",
  },
];

export function applyParseCategoryFixes(parsed: ParsedStatement): ParsedStatement {
  return {
    ...parsed,
    transactions: parsed.transactions.map((txn) => {
      const text = blob(txn);
      const fix = CATEGORY_FIXES.find((rule) => rule.test(text));
      if (!fix) return txn;
      return {
        ...txn,
        section: fix.section,
        category: fix.category,
        subcategory: fix.subcategory,
        transactionCode: fix.transactionCode ?? txn.transactionCode,
      };
    }),
  };
}

export function isDepositoryStatement(accountType: string | null | undefined) {
  const type = normalizeStatementAccountType(accountType);
  return type === "chequing" || type === "savings";
}

/** Ledger signs: positive = money out. Deposit closing = opening - sum. */
export function statementEffectOnBalance(
  accountType: string | null | undefined,
  transactionSum: number,
) {
  return isDepositoryStatement(accountType) ? -transactionSum : transactionSum;
}

function closingMatches(
  opening: number,
  closing: number,
  sum: number,
  accountType: string | null | undefined,
) {
  const computed = round2(opening + statementEffectOnBalance(accountType, sum));
  return Math.abs(computed - round2(closing)) <= 0.02;
}

function flipAmounts(parsed: ParsedStatement): ParsedStatement {
  return {
    ...parsed,
    transactions: parsed.transactions.map((txn) => ({
      ...txn,
      amount: round2(-txn.amount),
    })),
  };
}

/**
 * CIBC chequing prints withdrawals as negative cash. Ledger wants positive = out.
 * If opening+sum=closing on a deposit account, flip every amount.
 */
export function alignParsedAmountSigns(parsed: ParsedStatement): ParsedStatement {
  const opening = parsed.openingBalance;
  const closing = parsed.closingBalance;
  if (opening == null || closing == null || parsed.transactions.length === 0) {
    return parsed;
  }

  const sum = round2(
    parsed.transactions.reduce((total, txn) => total + txn.amount, 0),
  );
  const type = parsed.accountType;
  const invertedType = isDepositoryStatement(type) ? "credit" : "chequing";

  if (closingMatches(opening, closing, sum, type)) return parsed;
  if (closingMatches(opening, closing, sum, invertedType)) {
    return flipAmounts(parsed);
  }

  return parsed;
}

function cleanTransactionText(parsed: ParsedStatement): ParsedStatement {
  return {
    ...parsed,
    transactions: parsed.transactions.map((txn) => ({
      ...txn,
      description: cleanStatementLine(txn.description),
      merchantName: txn.merchantName
        ? cleanStatementLine(txn.merchantName)
        : txn.merchantName,
    })),
  };
}

export type PolishParsedOptions = {
  vocabulary: CategoryVocabulary;
  ocrMarkdown?: string | null;
  sourceHint?: string | null;
  dedupe: (parsed: ParsedStatement) => ParsedStatement;
};

/** Clean OCR junk, lock mask, map categories, then fix deposit vs card signs. */
export function polishParsedStatement(
  raw: ParsedStatement,
  options: PolishParsedOptions,
): ParsedStatement {
  const cleaned = cleanTransactionText(raw);
  const withMask = {
    ...cleaned,
    accountMask: resolveAccountMask({
      parsedMask: cleaned.accountMask,
      accountType: cleaned.accountType,
      sourceHint: options.sourceHint,
      ocrMarkdown: options.ocrMarkdown,
    }),
  };
  const categorized = applyParseCategoryFixes(
    normalizeParsedCategories(withMask, options.vocabulary),
  );
  const deduped = options.dedupe(categorized);
  return alignParsedAmountSigns(deduped);
}

export type PolishPaperFactsOptions = {
  ocrMarkdown?: string | null;
  sourceHint?: string | null;
  dedupe: (parsed: ParsedStatement) => ParsedStatement;
};

/**
 * Paper-facts polish only: clean text, lock mask, dedupe twins, fix amount signs.
 * Does not invent categories, channels, or merchant labels.
 */
export function polishPaperFactsStatement(
  raw: ParsedStatement,
  options: PolishPaperFactsOptions,
): ParsedStatement {
  const cleaned = cleanTransactionText(raw);
  const withMask = {
    ...cleaned,
    accountMask: resolveAccountMask({
      parsedMask: cleaned.accountMask,
      accountType: cleaned.accountType,
      sourceHint: options.sourceHint,
      ocrMarkdown: options.ocrMarkdown,
    }),
  };
  const deduped = options.dedupe(withMask);
  return alignParsedAmountSigns(deduped);
}
