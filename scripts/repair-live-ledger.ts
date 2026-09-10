import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { cleanStatementLine } from "../src/domains/statements/application/polishParsedStatement";
import { manualAccountId } from "../src/domains/statements/domain/parsedStatement";
import { getDb } from "../src/shared/db";
import { accounts, statementUploads, transactions } from "../src/shared/db/schema";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function flipDepositorySigns() {
  const db = getDb();
  const depositAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.type, "depository"));

  let flipped = 0;
  for (const account of depositAccounts) {
    const rows = await db
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
      .where(eq(transactions.accountId, account.accountId));
    if (rows.length === 0) continue;

    const negative = rows.filter((row) => row.amount < 0).length;
    if (negative / rows.length < 0.55) continue;

    for (const row of rows) {
      await db
        .update(transactions)
        .set({ amount: round2(-row.amount), updatedAt: new Date() })
        .where(eq(transactions.id, row.id));
      flipped += 1;
    }

    const uploads = await db
      .select()
      .from(statementUploads)
      .where(eq(statementUploads.accountMask, account.mask ?? ""));
    for (const upload of uploads) {
      if (upload.transactionSum == null) continue;
      await db
        .update(statementUploads)
        .set({ transactionSum: round2(-upload.transactionSum) })
        .where(eq(statementUploads.id, upload.id));
    }
  }

  return { accounts: depositAccounts.length, flipped };
}

async function mergeWrongVisaMask() {
  const db = getDb();
  const wrong = await db
    .select()
    .from(accounts)
    .where(eq(accounts.mask, "3945"));
  if (wrong.length === 0) return { moved: 0, from: null, to: null };

  let moved = 0;
  for (const account of wrong) {
    const nextId = manualAccountId({
      institutionName: account.officialName ?? account.name,
      accountMask: "1654",
      accountType: "credit",
    });

    const existing = await db
      .select()
      .from(accounts)
      .where(eq(accounts.accountId, nextId))
      .limit(1);

    if (!existing[0]) {
      await db.insert(accounts).values({
        accountId: nextId,
        institutionId: account.institutionId,
        name: account.name,
        officialName: account.officialName,
        mask: "1654",
        type: account.type,
        subtype: account.subtype,
        currentBalance: account.currentBalance,
        availableBalance: account.availableBalance,
        isoCurrencyCode: account.isoCurrencyCode,
        updatedAt: new Date(),
      });
    }

    const txns = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.accountId, account.accountId));
    for (const txn of txns) {
      await db
        .update(transactions)
        .set({ accountId: nextId, updatedAt: new Date() })
        .where(eq(transactions.id, txn.id));
      moved += 1;
    }

    await db
      .update(statementUploads)
      .set({ accountMask: "1654" })
      .where(eq(statementUploads.accountMask, "3945"));

    await db.delete(accounts).where(eq(accounts.accountId, account.accountId));
  }

  return { moved, from: "3945", to: "1654" };
}

async function cleanNamesAndCategories() {
  const db = getDb();
  const rows = await db
    .select({
      id: transactions.id,
      name: transactions.name,
      merchantName: transactions.merchantName,
      originalDescription: transactions.originalDescription,
      categoryDetailed: transactions.categoryDetailed,
      categoryPrimary: transactions.categoryPrimary,
      transactionCode: transactions.transactionCode,
    })
    .from(transactions);

  let cleaned = 0;
  let recategorized = 0;
  for (const row of rows) {
    const name = cleanStatementLine(row.name);
    const merchantName = row.merchantName
      ? cleanStatementLine(row.merchantName)
      : row.merchantName;
    const originalDescription = row.originalDescription
      ? cleanStatementLine(row.originalDescription)
      : row.originalDescription;
    const blob = `${merchantName ?? ""} ${name} ${originalDescription ?? ""}`;

    const patch: Partial<typeof row> & {
      categoryDetailed?: string;
      categoryPrimary?: string;
      transactionCode?: string;
      updatedAt: Date;
      name: string;
      merchantName: string | null;
      originalDescription: string | null;
    } = {
      name,
      merchantName,
      originalDescription,
      updatedAt: new Date(),
    };

    if (
      /payment\s*thank\s*you/i.test(blob) ||
      /paiement\s*merci/i.test(blob) ||
      /pad\s+payment.{0,40}card/i.test(blob)
    ) {
      patch.categoryDetailed = "Credit Card Payment";
      patch.categoryPrimary = "TRANSFER";
      patch.transactionCode = "payment";
    } else if (/movati|goodlife|anytime\s*fitness/i.test(blob)) {
      patch.categoryDetailed = "Gyms";
      patch.categoryPrimary = "ENTERTAINMENT";
    } else if (
      /openai|chatgpt|\bt3\s*chat\b|wealthsimple\s*tax/i.test(blob)
    ) {
      patch.categoryDetailed = "SaaS";
      patch.categoryPrimary = "GENERAL_SERVICES";
    }

    const changed =
      patch.name !== row.name ||
      patch.merchantName !== row.merchantName ||
      patch.originalDescription !== row.originalDescription ||
      patch.categoryDetailed !== undefined;

    if (!changed) continue;
    if (patch.categoryDetailed && patch.categoryDetailed !== row.categoryDetailed) {
      recategorized += 1;
    }
    if (patch.name !== row.name || patch.merchantName !== row.merchantName) {
      cleaned += 1;
    }

    await db
      .update(transactions)
      .set({
        name: patch.name,
        merchantName: patch.merchantName,
        originalDescription: patch.originalDescription,
        ...(patch.categoryDetailed
          ? {
              categoryDetailed: patch.categoryDetailed,
              categoryPrimary: patch.categoryPrimary,
              transactionCode: patch.transactionCode,
            }
          : {}),
        updatedAt: patch.updatedAt,
      })
      .where(eq(transactions.id, row.id));
  }

  return { cleaned, recategorized };
}

async function dropSameDayTwins() {
  const db = getDb();
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactions.date,
      amount: transactions.amount,
      name: transactions.name,
    })
    .from(transactions)
    .orderBy(transactions.id);

  const seen = new Map<string, number>();
  let removed = 0;
  for (const row of rows) {
    const key = `${row.accountId}|${row.date}|${row.amount}|${row.name.toLowerCase()}`;
    const keeper = seen.get(key);
    if (keeper == null) {
      seen.set(key, row.id);
      continue;
    }
    await db.delete(transactions).where(eq(transactions.id, row.id));
    removed += 1;
  }
  return { removed };
}

async function main() {
  const signs = await flipDepositorySigns();
  console.log(`signs flipped=${signs.flipped} depositAccounts=${signs.accounts}`);

  const visa = await mergeWrongVisaMask();
  console.log(`visa mask moved=${visa.moved} ${visa.from ?? "-"} -> ${visa.to ?? "-"}`);

  const names = await cleanNamesAndCategories();
  console.log(
    `names cleaned=${names.cleaned} recategorized=${names.recategorized}`,
  );

  const twins = await dropSameDayTwins();
  console.log(`same-day twins removed=${twins.removed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
