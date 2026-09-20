import { statementEffectOnBalance } from "@/domains/statements/application/polishParsedStatement";
import {
  normalizeStatementText,
  type ParsedStatement,
} from "@/domains/statements/domain/parsedStatement";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type ParsedTxn = ParsedStatement["transactions"][number];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseIsoDays(value: string | null | undefined): number | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function monthTokenToNumber(token: string): number | null {
  const key = token.slice(0, 3).toLowerCase();
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return months[key] ?? null;
}

/** Turn "Jul 24" / "Aug 03" into YYYY-MM-DD using statement period year. */
export function coerceStatementDate(
  raw: string | null | undefined,
  periodStart: string | null,
  periodEnd: string | null,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (ISO_DATE.test(trimmed)) return trimmed;

  const match = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
  if (!match) return null;

  const month = monthTokenToNumber(match[1]);
  const day = Number(match[2]);
  if (!month || !Number.isFinite(day) || day < 1 || day > 31) return null;

  const explicitYear = match[3] ? Number(match[3]) : null;
  const yearFromPeriod =
    (periodEnd && ISO_DATE.test(periodEnd)
      ? Number(periodEnd.slice(0, 4))
      : null) ??
    (periodStart && ISO_DATE.test(periodStart)
      ? Number(periodStart.slice(0, 4))
      : null);

  const year = explicitYear ?? yearFromPeriod;
  if (!year) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const DATE_ONLY_DESC =
  /^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+\d{1,2}(,?\s*\d{4})?$/i;

const REGISTER_RAIL =
  /^(pad|pos debit|pos return|direct dep(?:osit)?|interac e-transfer(?: in| out)?|bill payment|online purchase|online payment|atm withdrawal|transfer to|cheque|donation|credit interest|monthly plan fee)\b/;

function lineKey(txn: ParsedTxn) {
  return `${txn.amount}|${normalizeStatementText(txn.description || txn.merchantName || "")}`;
}

/** True when OCR used the date cell as the payee ("Jan 01"). */
export function isDateOnlyDescription(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (ISO_DATE.test(trimmed)) return true;
  const normalized = normalizeStatementText(trimmed);
  return DATE_ONLY_DESC.test(normalized);
}

function registerPayee(description: string): string | null {
  const normalized = normalizeStatementText(description);
  const match = normalized.match(REGISTER_RAIL);
  if (!match) return null;
  const rest = normalized.slice(match[0].length).trim();
  return rest || match[0];
}

function descriptionQuality(txn: ParsedTxn): number {
  const desc = txn.description.trim();
  let score = Math.min(desc.length, 80);
  if (!isDateOnlyDescription(desc)) score += 50;
  if (REGISTER_RAIL.test(normalizeStatementText(desc))) score += 40;
  if (txn.category && txn.category !== "Banking Fees") score += 8;
  return score;
}

/**
 * Register + category recap print the same posted amount twice with
 * different text (short rail vs long payee vs a bare "Jan 01").
 * Keep distinct rails on the same day; collapse the rest.
 */
function collapseRegisterRecapTwins(txns: ParsedTxn[]): ParsedTxn[] {
  const groups = new Map<string, ParsedTxn[]>();
  for (const txn of txns) {
    if (isDateOnlyDescription(txn.description)) continue;
    const key = `${txn.date}|${round2(txn.amount)}`;
    const list = groups.get(key) ?? [];
    list.push(txn);
    groups.set(key, list);
  }

  const out: ParsedTxn[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }

    const railed = new Map<string, ParsedTxn[]>();
    const unrailed: ParsedTxn[] = [];
    for (const txn of group) {
      const payee = registerPayee(txn.description);
      if (!payee) {
        unrailed.push(txn);
        continue;
      }
      const list = railed.get(payee) ?? [];
      list.push(txn);
      railed.set(payee, list);
    }

    if (railed.size > 1) {
      for (const rows of railed.values()) {
        out.push(pickPreferredTwin(rows));
      }
      continue;
    }

    if (railed.size === 1) {
      let keeper = pickPreferredTwin([...railed.values()][0]!);
      for (const extra of unrailed) {
        keeper = mergeTwin(keeper, extra);
      }
      out.push(keeper);
      continue;
    }

    out.push(pickPreferredTwin(group));
  }
  return out;
}

function pickPreferredTwin(rows: ParsedTxn[]): ParsedTxn {
  let keeper = rows[0]!;
  for (let index = 1; index < rows.length; index += 1) {
    const other = rows[index]!;
    const preferOther = descriptionQuality(other) > descriptionQuality(keeper);
    const drop = preferOther ? keeper : other;
    keeper = mergeTwin(preferOther ? other : keeper, drop);
  }
  return keeper;
}

function preferPostedRow(a: ParsedTxn, b: ParsedTxn): ParsedTxn {
  const aAuth = a.authorizedDate;
  const bAuth = b.authorizedDate;
  // Prefer the row whose date is the post date (differs from authorized/trans date).
  const aIsPosted = Boolean(aAuth && a.date !== aAuth && ISO_DATE.test(a.date));
  const bIsPosted = Boolean(bAuth && b.date !== bAuth && ISO_DATE.test(b.date));
  if (aIsPosted && !bIsPosted) return a;
  if (bIsPosted && !aIsPosted) return b;

  const aDays = parseIsoDays(a.date);
  const bDays = parseIsoDays(b.date);
  if (aDays != null && bDays != null && aDays !== bDays) {
    // Post date is usually later than trans date.
    return aDays >= bDays ? a : b;
  }

  return ISO_DATE.test(a.date) ? a : b;
}

function mergeTwin(keeper: ParsedTxn, drop: ParsedTxn): ParsedTxn {
  const authorizedDate =
    keeper.authorizedDate ??
    drop.authorizedDate ??
    (keeper.date !== drop.date ? drop.date : null);

  return {
    ...keeper,
    authorizedDate,
    section: keeper.section ?? drop.section,
    category: keeper.category ?? drop.category,
    subcategory: keeper.subcategory ?? drop.subcategory,
    paymentChannel: keeper.paymentChannel ?? drop.paymentChannel,
    merchantName: keeper.merchantName ?? drop.merchantName,
    foreignAmount: keeper.foreignAmount ?? drop.foreignAmount,
    foreignCurrency: keeper.foreignCurrency ?? drop.foreignCurrency,
    exchangeRate: keeper.exchangeRate ?? drop.exchangeRate,
  };
}

/**
 * Collapse Gemini twins where Trans date and Post date became two rows,
 * and normalize loose dates like "Jul 24".
 */
export function dedupeParsedTransactions(
  parsed: ParsedStatement,
): ParsedStatement {
  const normalized = parsed.transactions
    .map((txn) => {
      const date =
        coerceStatementDate(
          txn.date,
          parsed.statementPeriodStart,
          parsed.statementPeriodEnd,
        ) ?? txn.date;
      const authorizedDate = coerceStatementDate(
        txn.authorizedDate,
        parsed.statementPeriodStart,
        parsed.statementPeriodEnd,
      );
      return {
        ...txn,
        date,
        authorizedDate: authorizedDate ?? txn.authorizedDate,
      };
    })
    .filter((txn) => ISO_DATE.test(txn.date));

  const groups = new Map<string, ParsedTxn[]>();
  for (const txn of normalized) {
    const key = lineKey(txn);
    const list = groups.get(key) ?? [];
    list.push(txn);
    groups.set(key, list);
  }

  const transactions: ParsedTxn[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      transactions.push(group[0]);
      continue;
    }

    const byDate = new Map<string, ParsedTxn[]>();
    for (const txn of group) {
      const list = byDate.get(txn.date) ?? [];
      list.push(txn);
      byDate.set(txn.date, list);
    }
    const collapsed: ParsedTxn[] = [];
    for (const sameDate of byDate.values()) {
      let keeper = sameDate[0];
      for (let index = 1; index < sameDate.length; index += 1) {
        const other = sameDate[index];
        const preferred = preferPostedRow(keeper, other);
        const drop = preferred === keeper ? other : keeper;
        keeper = mergeTwin(preferred, drop);
      }
      collapsed.push(keeper);
    }

    if (collapsed.length === 1) {
      transactions.push(collapsed[0]);
      continue;
    }

    const remaining = [...collapsed];
    while (remaining.length > 0) {
      const current = remaining.shift()!;
      let twinIndex = remaining.findIndex((other) => {
        if (other.date === current.date) return false;
        const currentDays = parseIsoDays(current.date);
        const otherDays = parseIsoDays(other.date);
        if (currentDays == null || otherDays == null) return false;
        if (Math.abs(currentDays - otherDays) > 7) return false;

        // Classic twin: one row's date equals the other's authorized/trans date.
        if (
          current.authorizedDate === other.date ||
          other.authorizedDate === current.date ||
          current.date === other.authorizedDate ||
          other.date === current.authorizedDate
        ) {
          return true;
        }

        // Same amount+desc within a few days and one lacks a distinct post date.
        const currentPosted = Boolean(
          current.authorizedDate && current.authorizedDate !== current.date,
        );
        const otherPosted = Boolean(
          other.authorizedDate && other.authorizedDate !== other.date,
        );
        return !currentPosted || !otherPosted;
      });

      if (twinIndex < 0) {
        transactions.push(current);
        continue;
      }

      const twin = remaining.splice(twinIndex, 1)[0];
      const keeper = preferPostedRow(current, twin);
      const drop = keeper === current ? twin : current;
      transactions.push(mergeTwin(keeper, drop));
    }
  }

  const collapsed = collapseRegisterRecapTwins(transactions);
  collapsed.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.description.localeCompare(b.description);
  });

  return { ...parsed, transactions: collapsed };
}

export type StatementBalanceCheck = {
  openingBalance: number | null;
  closingBalance: number | null;
  transactionSum: number;
  computedClosing: number | null;
  delta: number | null;
  balanced: boolean | null;
  transactionCount: number;
};

/**
 * Ledger signs: positive = money out.
 * Cards/LOC: opening + sum = closing.
 * Chequing/savings: opening - sum = closing.
 */
export function checkStatementBalance(
  parsed: ParsedStatement,
): StatementBalanceCheck {
  const openingBalance = parsed.openingBalance;
  const closingBalance = parsed.closingBalance;
  const transactionSum = round2(
    parsed.transactions.reduce((sum, txn) => sum + txn.amount, 0),
  );
  const computedClosing =
    openingBalance == null
      ? null
      : round2(
          openingBalance +
            statementEffectOnBalance(parsed.accountType, transactionSum),
        );
  const delta =
    computedClosing == null || closingBalance == null
      ? null
      : round2(computedClosing - closingBalance);
  const balanced = delta == null ? null : Math.abs(delta) <= 0.02;

  return {
    openingBalance,
    closingBalance,
    transactionSum,
    computedClosing,
    delta,
    balanced,
    transactionCount: parsed.transactions.length,
  };
}
