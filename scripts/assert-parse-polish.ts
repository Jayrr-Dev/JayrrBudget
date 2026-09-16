import { config } from "dotenv";
config({ path: ".env.local" });

import {
  hintAccountMask,
  resolveAccountMask,
} from "../src/domains/statements/application/accountMask";
import {
  checkStatementBalance,
  dedupeParsedTransactions,
} from "../src/domains/statements/application/balanceStatement";
import type { CategoryVocabulary } from "../src/domains/statements/application/categoryVocabulary";
import {
  alignParsedAmountSigns,
  applyParseCategoryFixes,
  cleanStatementLine,
  polishParsedStatement,
} from "../src/domains/statements/application/polishParsedStatement";
import { extractFxFromDescription } from "../src/domains/statements/domain/extractFxFromDescription";
import type { ParsedStatement } from "../src/domains/statements/domain/parsedStatement";

const vocab: CategoryVocabulary = {
  sections: ["Transfers", "Lifestyle", "Technology"],
  categories: ["Account Transfers", "Personal Care", "AI Services", "Software"],
  subcategories: [
    "Credit Card Payoffs",
    "Gym Memberships",
    "AI Assistants & Chat",
    "Productivity & Creative",
  ],
  paymentChannels: [],
  transactionCodes: [],
};

function txn(
  partial: Partial<ParsedStatement["transactions"][number]> & {
    date: string;
    description: string;
    amount: number;
  },
): ParsedStatement["transactions"][number] {
  return {
    authorizedDate: null,
    merchantName: null,
    section: null,
    category: null,
    subcategory: null,
    paymentChannel: "other",
    transactionCode: "other",
    pending: false,
    runningBalance: null,
    locationCity: null,
    locationRegion: null,
    locationCountry: null,
    checkNumber: null,
    referenceNumber: null,
    foreignAmount: null,
    foreignCurrency: null,
    exchangeRate: null,
    ...partial,
  };
}

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function assert(condition: unknown, message: string) {
  if (!condition) fail(message);
}

assert(hintAccountMask("visa1654") === "1654", "visa folder mask");
assert(hintAccountMask("loc52839") === "2839", "loc folder mask");
assert(hintAccountMask("mastercard9559") === "9559", "mc folder mask");
assert(
  resolveAccountMask({
    parsedMask: "3945",
    accountType: "credit",
    sourceHint: "visa1654 statement.pdf",
    ocrMarkdown: "Customer number 3945 Card ending in 1654",
  }) === "1654",
  "hint beats wrong parsed mask",
);

assert(
  cleanStatementLine("TIM HORTONS ❗ ↑ CAD") === "TIM HORTONS CAD",
  "strip dingbats",
);

const chequingCash: ParsedStatement = {
  institutionName: "CIBC",
  accountName: "Chequing",
  accountMask: "5192",
  accountType: "chequing",
  currency: "CAD",
  statementPeriodStart: "2025-07-24",
  statementPeriodEnd: "2025-08-21",
  openingBalance: 1677.35,
  closingBalance: 1251.02,
  totalDebits: null,
  totalCredits: null,
  transactions: [
    txn({
      date: "2025-08-01",
      description: "PAD PREAUTHORIZED DEBIT MOVATI",
      merchantName: "Movati",
      amount: -64.97,
      category: "Personal Care",
    }),
    txn({
      date: "2025-08-15",
      description: "DEPOSIT PAYROLL",
      amount: 2000,
    }),
    txn({
      date: "2025-08-20",
      description: "INTERNET TRANSFER",
      amount: -2361.36,
    }),
  ],
};

const flipped = alignParsedAmountSigns(chequingCash);
const gym = flipped.transactions.find((row) =>
  row.description.includes("MOVATI"),
);
assert(gym && gym.amount > 0, "chequing gym becomes money-out positive");
const deposit = flipped.transactions.find((row) =>
  row.description.includes("PAYROLL"),
);
assert(
  deposit && deposit.amount < 0,
  "chequing payroll becomes money-in negative",
);
const cheqBal = checkStatementBalance(flipped);
assert(
  cheqBal.balanced === true,
  `chequing balance after flip, delta=${cheqBal.delta}`,
);

const card: ParsedStatement = {
  ...chequingCash,
  accountType: "credit",
  accountMask: "1654",
  openingBalance: 100,
  closingBalance: 80,
  transactions: [
    txn({
      date: "2025-03-25",
      description: "PAYMENT THANK YOU",
      amount: -367.86,
      subcategory: "Payment Protection",
    }),
    txn({
      date: "2025-03-25",
      description: "PAYMENT THANK YOU",
      amount: -367.86,
      subcategory: "Transfer",
    }),
    txn({
      date: "2025-03-26",
      description: "OPENAI CHATGPT",
      merchantName: "OpenAI",
      amount: 21.0,
      subcategory: "Software",
    }),
  ],
};

const polished = polishParsedStatement(card, {
  vocabulary: vocab,
  sourceHint: "visa1654",
  ocrMarkdown: "Visa ending in 1654",
  dedupe: dedupeParsedTransactions,
});
assert(polished.accountMask === "1654", "polished mask");
assert(
  polished.transactions.length === 2,
  "same-day payment thank you collapsed",
);
const payment = polished.transactions.find((row) =>
  row.description.includes("PAYMENT"),
);
assert(
  payment?.subcategory === "Credit Card Payoffs",
  `payment category was ${payment?.subcategory}`,
);
assert(payment?.transactionCode === "payment", "payment code");
const openai = polished.transactions.find((row) =>
  (row.merchantName ?? "").includes("OpenAI"),
);
assert(
  openai?.subcategory === "AI Assistants & Chat",
  `openai was ${openai?.subcategory}`,
);

const gymFix = applyParseCategoryFixes({
  ...chequingCash,
  transactions: [
    txn({
      date: "2025-08-01",
      description: "PAD MOVATI ATHLETIC",
      merchantName: "Movati",
      amount: 64.97,
      category: "Personal Care",
    }),
  ],
});
assert(
  gymFix.transactions[0].subcategory === "Gym Memberships",
  "movati -> Gym Memberships",
);

const phpFx = extractFxFromDescription("ALDO CEBU CITY 12,280.00 PHP @ 0.024");
assert(phpFx.foreignCurrency === "PHP", "php currency");
assert(phpFx.foreignAmount === 12280, `php amount was ${phpFx.foreignAmount}`);
assert(phpFx.exchangeRate === 0.024, `php rate was ${phpFx.exchangeRate}`);

const usdFx = extractFxFromDescription("AIRBNB *X USD 12.00 @ 1.42");
assert(usdFx.foreignCurrency === "USD", "usd currency");
assert(usdFx.foreignAmount === 12, `usd amount was ${usdFx.foreignAmount}`);
assert(usdFx.exchangeRate === 1.42, `usd rate was ${usdFx.exchangeRate}`);

console.log("parse polish asserts ok");
