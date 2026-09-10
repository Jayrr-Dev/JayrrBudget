import { eq } from "drizzle-orm";
import { inferredBankDirection } from "@/domains/transactions/domain/debitCredit";
import { normalizeStatementText } from "@/domains/statements/domain/parsedStatement";
import { toMajor, toMinor } from "@/shared/db/money";
import { getDb } from "@/shared/db";
import {
  accounts,
  bankHistoryRows,
  transactionAmounts,
  transactionDates,
  transactionEnrichment,
  transactionPaymentRefs,
  transactions,
} from "@/shared/db/schema";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function absAmount(n: number) {
  return round2(Math.abs(n));
}

function parseIsoDays(value: string): number | null {
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function nameScore(a: string, b: string) {
  const left = normalizeStatementText(a);
  const right = normalizeStatementText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;

  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 2));
  const rightTokens = right.split(" ").filter((token) => token.length > 2);
  if (rightTokens.length === 0) return 0;
  let hit = 0;
  for (const token of rightTokens) {
    if (leftTokens.has(token)) hit += 1;
  }
  return hit / Math.max(rightTokens.length, 4);
}

function historyCode(description: string, direction: string) {
  const text = description.toLowerCase();
  if (/payment thank you|paiement merci/.test(text)) return "payment";
  if (/cash advance/.test(text)) return "cash_advance";
  if (/interest/.test(text)) return "interest";
  if (/service charge|monthly fee/.test(text)) return "fee";
  if (/internet transfer|e-?transfer/.test(text)) return "transfer";
  if (direction === "credit" && /refund|credit/.test(text)) return "refund";
  if (direction === "credit") return "payment";
  return null;
}

type HistoryRow = {
  id: number;
  accountMask: string;
  date: string;
  description: string;
  direction: string;
  amount: number;
};

type StatementRow = {
  id: number;
  accountId: string;
  mask: string;
  date: string;
  authorizedDate: string | null;
  name: string;
  merchantClean: string | null;
  amount: number;
  transactionCode: string | null;
};

function groupKey(mask: string, amountAbs: number) {
  return `${mask}|${amountAbs.toFixed(2)}`;
}

export type ReconcileBankHistoryResult = {
  historyRows: number;
  matched: number;
  historyUnmatched: number;
  statementExtra: number;
  signsFlipped: number;
};

export async function reconcileBankHistory(): Promise<ReconcileBankHistoryResult> {
  const db = getDb();

  const history = (await db.select().from(bankHistoryRows)) as HistoryRow[];
  const accountRows = await db.select().from(accounts);
  const maskByAccountId = new Map(
    accountRows.map((row) => [row.accountId, row.mask ?? ""]),
  );

  const statement = (
    await db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        date: transactionDates.postedDate,
        authorizedDate: transactionDates.authorizedDate,
        name: transactions.description,
        merchantClean: transactionEnrichment.merchantClean,
        amountMinor: transactionAmounts.amountMinor,
        transactionCode: transactionPaymentRefs.transactionCode,
      })
      .from(transactions)
      .innerJoin(
        transactionAmounts,
        eq(transactionAmounts.transactionId, transactions.id),
      )
      .innerJoin(
        transactionDates,
        eq(transactionDates.transactionId, transactions.id),
      )
      .leftJoin(
        transactionPaymentRefs,
        eq(transactionPaymentRefs.transactionId, transactions.id),
      )
      .leftJoin(
        transactionEnrichment,
        eq(transactionEnrichment.transactionId, transactions.id),
      )
  ).map((row) => ({
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    authorizedDate: row.authorizedDate,
    name: row.name,
    merchantClean: row.merchantClean,
    amount: toMajor(row.amountMinor),
    transactionCode: row.transactionCode,
    mask: maskByAccountId.get(row.accountId) ?? "",
  })) as StatementRow[];

  const byAmount = new Map<string, StatementRow[]>();
  for (const row of statement) {
    if (!row.mask) continue;
    const key = groupKey(row.mask, absAmount(row.amount));
    const list = byAmount.get(key) ?? [];
    list.push(row);
    byAmount.set(key, list);
  }

  const claimed = new Set<number>();
  const matches = new Map<
    number,
    { historyId: number; direction: string; amount: number; description: string }
  >();
  const matchedHistoryIds = new Set<number>();

  const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));

  for (const row of sortedHistory) {
    const candidates = (byAmount.get(groupKey(row.accountMask, absAmount(row.amount))) ?? [])
      .filter((txn) => !claimed.has(txn.id))
      .map((txn) => {
        const histDays = parseIsoDays(row.date);
        const dateDays = parseIsoDays(txn.date);
        const authDays = txn.authorizedDate
          ? parseIsoDays(txn.authorizedDate)
          : null;
        const dateDelta =
          histDays != null && dateDays != null
            ? Math.abs(histDays - dateDays)
            : 99;
        const authDelta =
          histDays != null && authDays != null
            ? Math.abs(histDays - authDays)
            : 99;
        const dayDelta = Math.min(dateDelta, authDelta);
        const blob = `${txn.merchantClean ?? ""} ${txn.name}`;
        const score = nameScore(blob, row.description);
        return { txn, dayDelta, score };
      })
      .filter((item) => item.dayDelta <= 5 && item.score >= 0.15)
      .sort((a, b) => {
        if (a.dayDelta !== b.dayDelta) return a.dayDelta - b.dayDelta;
        return b.score - a.score;
      });

    const best = candidates[0];
    if (!best) continue;
    claimed.add(best.txn.id);
    matchedHistoryIds.add(row.id);
    matches.set(best.txn.id, {
      historyId: row.id,
      direction: row.direction,
      amount: row.amount,
      description: row.description,
    });
  }

  for (const row of sortedHistory) {
    if (matchedHistoryIds.has(row.id)) continue;
    const leftovers = (byAmount.get(groupKey(row.accountMask, absAmount(row.amount))) ?? [])
      .filter((txn) => !claimed.has(txn.id))
      .map((txn) => {
        const histDays = parseIsoDays(row.date);
        const dateDays = parseIsoDays(txn.date);
        const authDays = txn.authorizedDate
          ? parseIsoDays(txn.authorizedDate)
          : null;
        const dateDelta =
          histDays != null && dateDays != null
            ? Math.abs(histDays - dateDays)
            : 99;
        const authDelta =
          histDays != null && authDays != null
            ? Math.abs(histDays - authDays)
            : 99;
        const dayDelta = Math.min(dateDelta, authDelta);
        const blob = `${txn.merchantClean ?? ""} ${txn.name}`;
        const score = nameScore(blob, row.description);
        return { txn, dayDelta, score };
      })
      .filter((item) => item.dayDelta <= 1);
    if (leftovers.length !== 1) continue;
    const only = leftovers[0];
    claimed.add(only.txn.id);
    matchedHistoryIds.add(row.id);
    matches.set(only.txn.id, {
      historyId: row.id,
      direction: row.direction,
      amount: row.amount,
      description: row.description,
    });
  }

  await db.update(bankHistoryRows).set({
    matchedTransactionId: null,
    matchStatus: "unmatched",
    bankDirection: null,
  });

  let signsFlipped = 0;
  const overlapByMask = new Map<string, { from: string; to: string }>();
  for (const row of history) {
    const span = overlapByMask.get(row.accountMask) ?? {
      from: row.date,
      to: row.date,
    };
    if (row.date < span.from) span.from = row.date;
    if (row.date > span.to) span.to = row.date;
    overlapByMask.set(row.accountMask, span);
  }

  for (const txn of statement) {
    const match = matches.get(txn.id);
    const span = overlapByMask.get(txn.mask);
    const inWindow =
      Boolean(span) && txn.date >= span!.from && txn.date <= span!.to;

    if (!match) {
      // Unmatched statement lines: no bank_history_rows link. Direction inferred only.
      void inWindow;
      void inferredBankDirection(txn.amount);
      continue;
    }

    const historySign = Math.sign(match.amount);
    const statementSign = Math.sign(txn.amount);
    const nextAmount =
      historySign !== 0 && statementSign !== 0 && historySign !== statementSign
        ? round2(-txn.amount)
        : txn.amount;
    if (nextAmount !== txn.amount) signsFlipped += 1;

    const nextCode = historyCode(match.description, match.direction);

    if (nextAmount !== txn.amount) {
      await db
        .update(transactionAmounts)
        .set({ amountMinor: toMinor(nextAmount) })
        .where(eq(transactionAmounts.transactionId, txn.id));
    }

    if (nextCode) {
      await db
        .insert(transactionPaymentRefs)
        .values({
          transactionId: txn.id,
          transactionCode: nextCode,
        })
        .onConflictDoUpdate({
          target: transactionPaymentRefs.transactionId,
          set: { transactionCode: nextCode },
        });
    }

    await db
      .update(bankHistoryRows)
      .set({
        matchedTransactionId: txn.id,
        matchStatus: "matched",
        bankDirection: match.direction,
      })
      .where(eq(bankHistoryRows.id, match.historyId));
  }

  const matched = matches.size;
  const historyUnmatched = history.length - matched;
  const statementExtra = statement.filter((txn) => {
    if (matches.has(txn.id)) return false;
    const span = overlapByMask.get(txn.mask);
    return Boolean(span) && txn.date >= span!.from && txn.date <= span!.to;
  }).length;

  return {
    historyRows: history.length,
    matched,
    historyUnmatched,
    statementExtra,
    signsFlipped,
  };
}
