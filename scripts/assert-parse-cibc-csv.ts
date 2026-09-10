import { readFileSync } from "node:fs";
import {
  accountHintFromFilename,
  parseCibcHistoryCsv,
  splitCsvLine,
} from "../src/domains/bank-history/domain/parseCibcCsv";

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function assert(condition: unknown, message: string) {
  if (!condition) fail(message);
}

const quoted = splitCsvLine(
  '2026-09-03,"CURSOR, AI POWERED IDE SAN FRANCISCO, CA",,7.34,5268********9559',
);
assert(quoted.length === 5, `expected 5 fields got ${quoted.length}`);
assert(quoted[1].includes("CURSOR"), "quoted merchant");
assert(quoted[2] === "", "empty debit");
assert(quoted[3] === "7.34", "credit amount");

assert(accountHintFromFilename("VISA 1654.csv")?.mask === "1654", "visa1654");
assert(accountHintFromFilename("LOC 52839.csv")?.mask === "2839", "loc");
assert(accountHintFromFilename("LOC 52839.csv")?.cardNumber === "52839", "loc card");
assert(accountHintFromFilename("cibc.csv")?.mask === "5192", "chequing");
assert(accountHintFromFilename("cibc.csv")?.cardNumber === "5192", "chequing card");

const cheq = parseCibcHistoryCsv(
  readFileSync(
    "C:/Users/Work/Documents/1-TASK/My Banking/Transactions/cibc.csv",
    "utf8",
  ),
  accountHintFromFilename("cibc.csv")!,
);
assert(cheq.length > 100, `chequing rows ${cheq.length}`);
const gym = cheq.find((row) => /movati/i.test(row.description));
assert(gym?.direction === "debit", "movati debit");
assert((gym?.amount ?? 0) > 0, "movati money out");
assert(cheq[0]?.cardNumber === "5192", "chequing card from filename");
const deposit = cheq.find((row) => /UTILITEK/i.test(row.description));
assert(deposit?.direction === "credit", "utilitek credit");
assert((deposit?.amount ?? 0) < 0, "utilitek money in");

const visa = parseCibcHistoryCsv(
  readFileSync(
    "C:/Users/Work/Documents/1-TASK/My Banking/Transactions/VISA 1654.csv",
    "utf8",
  ),
  accountHintFromFilename("VISA 1654.csv")!,
);
const payment = visa.find((row) => /PAYMENT THANK YOU/i.test(row.description));
assert(payment?.direction === "credit", "visa payment credit");
assert((payment?.amount ?? 0) < 0, "visa payment negative");
assert(visa[0]?.accountMask === "1654", "visa mask from card col");
assert(visa[0]?.cardNumber === "4500********1654", "visa card from csv col");

const loc = parseCibcHistoryCsv(
  readFileSync(
    "C:/Users/Work/Documents/1-TASK/My Banking/Transactions/LOC 52839.csv",
    "utf8",
  ),
  accountHintFromFilename("LOC 52839.csv")!,
);
assert(loc[0]?.cardNumber === "52839", "loc card from filename");
assert(loc[0]?.accountMask === "2839", "loc mask last 4");

console.log(
  `parse cibc csv ok cheq=${cheq.length} visa1654=${visa.length}`,
);
