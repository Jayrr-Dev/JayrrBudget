import { checkStatementBalance, coerceStatementDate } from "@/domains/statements/application/balanceStatement";
import { isDepositoryStatement } from "@/domains/statements/application/polishParsedStatement";
import type { ParsedStatement } from "@/domains/statements/domain/parsedStatement";

const SKIP_ROW =
  /^(opening balance|balance forward|brought forward|closing balance|balance carried forward)$/i;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function cellsOf(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || /^\|?\s*:?-{3,}/.test(trimmed)) {
    return [];
  }
  if (trimmed.includes("|")) {
    return trimmed.split("|").map((cell) => cell.trim());
  }
  if (trimmed.includes("\t")) {
    return trimmed.split("\t").map((cell) => cell.trim());
  }
  return [];
}

function isPageBanner(text: string): boolean {
  const head = text.toLowerCase();
  if (head.includes("account") && (head.includes("period") || head.includes("closing"))) {
    return true;
  }
  if (/\bpage\s+\d+\b/.test(head)) return true;
  return false;
}

function moneyInCell(cell: string): number | null {
  const matches = cell.replace(/,/g, "").match(/-?\d+\.\d{2}/g);
  const raw = matches?.[matches.length - 1];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** The line that lists withdrawals and deposits. Page banners only repeat opening and closing. */
function summaryBalances(markdown: string): { opening: number; closing: number } | null {
  for (const raw of markdown.split("\n")) {
    const head = raw.toLowerCase();
    if (!head.includes("opening") || !head.includes("closing")) continue;
    if (!head.includes("withdrawal") || !head.includes("deposit")) continue;
    const nums = [...raw.replace(/,/g, "").matchAll(/-?\d+\.\d{2}/g)].map((match) =>
      Number(match[0]),
    );
    const opening = nums[0];
    const closing = nums[nums.length - 1];
    if (opening == null || closing == null) continue;
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) continue;
    return { opening, closing };
  }
  return null;
}

type TableRow = {
  description: string;
  balance: number;
  date: string;
  skip: boolean;
};

function tableRows(markdown: string, periodStart: string | null, periodEnd: string | null): TableRow[] {
  const rows: TableRow[] = [];
  for (const raw of markdown.split("\n")) {
    const cells = cellsOf(raw).filter((cell) => cell.length > 0);
    if (cells.length < 2) continue;
    const head = cells.join(" ").toLowerCase();
    if (head.includes("description") && head.includes("balance")) continue;
    if (
      (head.includes("opening") && head.includes("closing")) ||
      (head.includes("withdrawal") && head.includes("deposit"))
    ) {
      continue;
    }
    let balance: number | null = null;
    for (let index = cells.length - 1; index >= 0; index -= 1) {
      balance = moneyInCell(cells[index] ?? "");
      if (balance != null) break;
    }
    if (balance == null) continue;
    const dated = coerceStatementDate(cells[0], periodStart, periodEnd);
    if (!dated && isPageBanner(head)) continue;
    const date = dated ?? rows[rows.length - 1]?.date ?? null;
    if (!date) continue;
    const description = (dated ? cells[1] : cells[0] ?? "").trim();
    if (!description || isPageBanner(description)) continue;
    rows.push({
      description,
      balance,
      date,
      skip: SKIP_ROW.test(description),
    });
  }
  return rows;
}

function blankTxn(
  date: string,
  description: string,
  amount: number,
): ParsedStatement["transactions"][number] {
  return {
    date,
    authorizedDate: null,
    description,
    merchantName: null,
    amount,
    section: null,
    category: null,
    subcategory: null,
    paymentChannel: null,
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
  };
}

/**
 * Set each line's amount from the change in the Balance column.
 * Returns the statement only when that walk matches the closing balance.
 */
export function applyRunningBalance(
  parsed: ParsedStatement,
  markdown: string,
): ParsedStatement | null {
  const rows = tableRows(
    markdown,
    parsed.statementPeriodStart,
    parsed.statementPeriodEnd,
  );
  if (rows.length < 2) return null;

  const depository = isDepositoryStatement(parsed.accountType);
  const transactions: ParsedStatement["transactions"] = [];
  let previous = rows[0]?.balance ?? null;
  for (const row of rows) {
    if (previous == null) {
      previous = row.balance;
      continue;
    }
    const change = round2(row.balance - previous);
    if (row.skip && Math.abs(change) > 0.02) continue;
    previous = row.balance;
    if (row.skip) continue;
    if (Math.abs(change) < 0.005) continue;
    const amount = depository ? round2(-change) : change;
    transactions.push(blankTxn(row.date, row.description, amount));
  }

  if (!transactions.length) return null;
  const summary = summaryBalances(markdown);
  const next = {
    ...parsed,
    transactions,
    openingBalance: summary?.opening ?? parsed.openingBalance,
    closingBalance: summary?.closing ?? parsed.closingBalance,
  };
  const check = checkStatementBalance(next);
  if (check.balanced !== true) return null;
  return next;
}
