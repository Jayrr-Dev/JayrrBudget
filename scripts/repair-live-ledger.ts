import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { cleanStatementLine } from "../src/domains/statements/application/polishParsedStatement";
import { manualAccountId } from "../src/domains/statements/domain/parsedStatement";
import { getDb } from "../src/shared/db";
import {
  accounts,
  statementUploads,
  transactionAmounts,
  transactionBankCategories,
  transactionDates,
  transactionEnrichment,
  transactionPaymentRefs,
  transactions,
} from "../src/shared/db/schema";

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
      .select({
        id: transactions.id,
        amountMinor: transactionAmounts.amountMinor,
      })
      .from(transactions)
      .innerJoin(
        transactionAmounts,
        eq(transactionAmounts.transactionId, transactions.id),
      )
      .where(eq(transactions.accountId, account.accountId));
    if (rows.length === 0) continue;

    const negative = rows.filter((row) => row.amountMinor < 0).length;
    if (negative / rows.length < 0.55) continue;

    for (const row of rows) {
      await db
        .update(transactionAmounts)
        .set({ amountMinor: -row.amountMinor })
        .where(eq(transactionAmounts.transactionId, row.id));
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
      description: transactions.description,
      merchantRaw: transactionEnrichment.merchantRaw,
      merchantClean: transactionEnrichment.merchantClean,
      categoryDetailed: transactionBankCategories.categoryDetailed,
      categoryPrimary: transactionBankCategories.categoryPrimary,
      transactionCode: transactionPaymentRefs.transactionCode,
    })
    .from(transactions)
    .leftJoin(
      transactionEnrichment,
      eq(transactionEnrichment.transactionId, transactions.id),
    )
    .leftJoin(
      transactionBankCategories,
      eq(transactionBankCategories.transactionId, transactions.id),
    )
    .leftJoin(
      transactionPaymentRefs,
      eq(transactionPaymentRefs.transactionId, transactions.id),
    );

  let cleaned = 0;
  let recategorized = 0;
  for (const row of rows) {
    const description = cleanStatementLine(row.description);
    const merchantRaw = row.merchantRaw
      ? cleanStatementLine(row.merchantRaw)
      : row.merchantRaw;
    const merchantClean = row.merchantClean
      ? cleanStatementLine(row.merchantClean)
      : row.merchantClean;
    const blob = `${merchantClean ?? ""} ${merchantRaw ?? ""} ${description}`;

    const categoryPatch: {
      categoryDetailed?: string;
      categoryPrimary?: string;
      transactionCode?: string;
    } = {};

    if (
      /payment\s*thank\s*you/i.test(blob) ||
      /paiement\s*merci/i.test(blob) ||
      /pad\s+payment.{0,40}card/i.test(blob)
    ) {
      categoryPatch.categoryDetailed = "Credit Card Payment";
      categoryPatch.categoryPrimary = "TRANSFER";
      categoryPatch.transactionCode = "payment";
    } else if (/movati|goodlife|anytime\s*fitness/i.test(blob)) {
      categoryPatch.categoryDetailed = "Gyms";
      categoryPatch.categoryPrimary = "ENTERTAINMENT";
    } else if (
      /openai|chatgpt|\bt3\s*chat\b|wealthsimple\s*tax/i.test(blob)
    ) {
      categoryPatch.categoryDetailed = "SaaS";
      categoryPatch.categoryPrimary = "GENERAL_SERVICES";
    }

    const changed =
      description !== row.description ||
      merchantRaw !== row.merchantRaw ||
      merchantClean !== row.merchantClean ||
      categoryPatch.categoryDetailed !== undefined;

    if (!changed) continue;
    if (
      categoryPatch.categoryDetailed &&
      categoryPatch.categoryDetailed !== row.categoryDetailed
    ) {
      recategorized += 1;
    }
    if (
      description !== row.description ||
      merchantRaw !== row.merchantRaw ||
      merchantClean !== row.merchantClean
    ) {
      cleaned += 1;
    }

    await db
      .update(transactions)
      .set({ description, updatedAt: new Date() })
      .where(eq(transactions.id, row.id));

    if (merchantRaw !== row.merchantRaw || merchantClean !== row.merchantClean) {
      if (row.merchantRaw != null || row.merchantClean != null) {
        await db
          .update(transactionEnrichment)
          .set({
            merchantRaw: merchantRaw ?? row.merchantRaw,
            merchantClean: merchantClean ?? row.merchantClean,
            updatedAt: new Date(),
          })
          .where(eq(transactionEnrichment.transactionId, row.id));
      }
    }

    if (categoryPatch.categoryDetailed) {
      if (row.categoryPrimary != null || row.categoryDetailed != null) {
        await db
          .update(transactionBankCategories)
          .set({
            categoryDetailed: categoryPatch.categoryDetailed,
            categoryPrimary: categoryPatch.categoryPrimary,
          })
          .where(eq(transactionBankCategories.transactionId, row.id));
      } else {
        await db.insert(transactionBankCategories).values({
          transactionId: row.id,
          categoryDetailed: categoryPatch.categoryDetailed,
          categoryPrimary: categoryPatch.categoryPrimary,
        });
      }

      if (categoryPatch.transactionCode) {
        if (row.transactionCode != null) {
          await db
            .update(transactionPaymentRefs)
            .set({ transactionCode: categoryPatch.transactionCode })
            .where(eq(transactionPaymentRefs.transactionId, row.id));
        } else {
          await db.insert(transactionPaymentRefs).values({
            transactionId: row.id,
            transactionCode: categoryPatch.transactionCode,
          });
        }
      }
    }
  }

  return { cleaned, recategorized };
}

async function dropSameDayTwins() {
  const db = getDb();
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      date: transactionDates.postedDate,
      amountMinor: transactionAmounts.amountMinor,
      description: transactions.description,
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
    .orderBy(transactions.id);

  const seen = new Map<string, number>();
  let removed = 0;
  for (const row of rows) {
    const key = `${row.accountId}|${row.date}|${row.amountMinor}|${row.description.toLowerCase()}`;
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
