// Run: node scripts/run-convex-tests.mjs scripts/piggy-transactions.test.mts
import test from "node:test";
import assert from "node:assert/strict";
import {
  bulkUpdateForAi,
  createForAi,
  deleteForAi,
  updateForAi,
  updateTaxonomy,
} from "../convex/transactions";

/** Minimal Convex db double: eq-only index filters, in-memory tables, query counters. */
function database() {
  const tables: Record<string, any[]> = {
    users: [{ _id: "alice" }, { _id: "bob" }],
  };
  const queryCounts: Record<string, number> = {};
  const db = {
    query(table: string) {
      queryCounts[table] = (queryCounts[table] ?? 0) + 1;
      const conditions: [string, unknown][] = [];
      const rows = () =>
        (tables[table] ?? []).filter((r) =>
          conditions.every(([k, value]) => r[k] === value),
        );
      const query = {
        withIndex(_index: string, fn?: (q: any) => unknown) {
          const builder = {
            eq(k: string, value: unknown) {
              conditions.push([k, value]);
              return builder;
            },
          };
          fn?.(builder);
          return query;
        },
        collect: async () => rows(),
        unique: async () => rows()[0] ?? null,
        first: async () => rows()[0] ?? null,
      };
      return query;
    },
    get: async (id: string) =>
      Object.values(tables).flat().find((r) => r._id === id) ?? null,
    insert: async (table: string, value: any) => {
      const rows = (tables[table] ??= []);
      const id = `${table}-${rows.length}`;
      rows.push({ ...value, _id: id });
      return id;
    },
    patch: async (id: string, value: any) =>
      Object.assign((await db.get(id))!, value),
    delete: async (id: string) => {
      for (const key in tables) tables[key] = tables[key].filter((r) => r._id !== id);
    },
  };
  const ctx = {
    db,
    storage: { getUrl: async () => null },
    auth: { getUserIdentity: async () => ({ subject: "alice|session" }) },
  };
  return { db, tables, ctx, queryCounts };
}

const call = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);

const baseTxn = {
  userId: "alice",
  posted: "2026-01-10",
  authorized: null,
  account: "Chequing",
  accountId: "chq",
  originalDescription: null,
  merchantId: null,
  merchantClean: null,
  merchantName: null,
  company: null,
  brand: null,
  section: null,
  category: null,
  subcategory: null,
  spread: null,
  transactionType: null,
  kind: null,
  sectionLegacyId: null,
  categoryLegacyId: null,
  subcategoryLegacyId: null,
  spreadLegacyId: null,
  transactionTypeLegacyId: null,
  kindLegacyId: null,
  tags: null,
  channel: null,
  txnCode: null,
  bankDirection: null,
  crossCheck: null,
  enrichment: null,
  source: "statement",
  pending: false,
  city: null,
  region: null,
  country: null,
  website: null,
  logoUrl: null,
  currency: "CAD",
  debit: 12,
  credit: null,
  amount: 12,
  updatedAt: 1,
};

async function seedTaxonomy(db: ReturnType<typeof database>["db"]) {
  await db.insert("transactionSections", { userId: "alice", legacyId: 1, name: "Food", description: "" });
  await db.insert("transactionCategories", { userId: "alice", legacyId: 1, name: "Dining", sectionLegacyId: 1, description: "" });
  await db.insert("transactionSubcategories", { userId: "alice", legacyId: 1, name: "Cafes", categoryLegacyId: 1, description: "" });
}

test("updateForAi never touches another user's row", async () => {
  const { db, ctx, tables } = database();
  await db.insert("transactions", { ...baseTxn, userId: "bob", transactionId: "t-bob", description: "BOB" });
  await assert.rejects(
    call(updateForAi, ctx, { transactionId: "t-bob", patch: { description: "hacked" } }),
    /Transaction not found/,
  );
  assert.equal(tables.transactions[0].description, "BOB");
});

test("updateForAi edits description, date, amount, tags and cascades subcategory -> category -> section", async () => {
  const { db, ctx, tables } = database();
  await seedTaxonomy(db);
  await db.insert("transactions", { ...baseTxn, transactionId: "t1", description: "SQ *CAFE 123", tags: "Old, Keep" });

  const result = await call(updateForAi, ctx, {
    transactionId: "t1",
    patch: {
      description: "Corner Cafe",
      posted: "2026-02-01",
      amount: -5.5,
      subcategory: "cafes",
      addTags: ["Coffee", "keep"],
      removeTags: ["old"],
    },
  });

  const row = tables.transactions[0];
  assert.equal(row.description, "Corner Cafe");
  assert.equal(row.originalDescription, "SQ *CAFE 123");
  assert.equal(row.posted, "2026-02-01");
  assert.equal(row.amount, -5.5);
  assert.equal(row.debit, null);
  assert.equal(row.credit, 5.5);
  assert.equal(row.tags, "Keep, Coffee");
  assert.equal(row.subcategory, "Cafes");
  assert.equal(row.category, "Dining");
  assert.equal(row.section, "Food");
  assert.equal(row.sectionLegacyId, 1);
  assert.equal(row.spread, "Wants");
  assert.equal(tables.transactionSpreads.length, 1);
  assert.deepEqual(result.changed.sort(), ["amount", "description", "posted", "tags", "taxonomy"]);
  assert.equal(result.transaction.merchant, null);
});

test("changing section drops a category that belongs to a different section", async () => {
  const { db, ctx, tables } = database();
  await seedTaxonomy(db);
  await db.insert("transactions", {
    ...baseTxn, transactionId: "t1", description: "X",
    section: "Food", sectionLegacyId: 1, category: "Dining", categoryLegacyId: 1, subcategory: "Cafes", subcategoryLegacyId: 1,
  });
  await call(updateForAi, ctx, { transactionId: "t1", patch: { section: "Transport" } });
  const row = tables.transactions[0];
  assert.equal(row.section, "Transport");
  assert.equal(row.category, null);
  assert.equal(row.subcategory, null);
  assert.equal(row.spread, "Needs");
  assert.equal(tables.transactionSections.length, 2, "new section created once");
});

test("bulkUpdateForAi patches every owned id, reports missing ids, and reads each taxonomy table once", async () => {
  const { db, ctx, tables, queryCounts } = database();
  await seedTaxonomy(db);
  await db.insert("transactions", { ...baseTxn, transactionId: "t1", description: "A" });
  await db.insert("transactions", { ...baseTxn, transactionId: "t2", description: "B" });
  await db.insert("transactions", { ...baseTxn, userId: "bob", transactionId: "t-bob", description: "C" });

  const result = await call(bulkUpdateForAi, ctx, {
    transactionIds: ["t1", "t2", "t-bob", "nope"],
    patch: { category: "Dining", addTags: ["Bulk"] },
  });

  assert.equal(result.updated, 2);
  assert.deepEqual(result.missing, ["t-bob", "nope"]);
  assert.deepEqual(result.changed.sort(), ["tags", "taxonomy"]);
  assert.ok(tables.transactions.filter((r) => r.userId === "alice").every((r) => r.category === "Dining" && r.section === "Food"));
  assert.equal(tables.transactions.find((r) => r.transactionId === "t-bob")!.category, null);
  assert.equal(queryCounts.transactionCategories, 1);
  assert.equal(queryCounts.transactionSections, 1);
});

test("bulkUpdateForAi rejects empty patches and oversized batches", async () => {
  const { ctx } = database();
  await assert.rejects(call(bulkUpdateForAi, ctx, { transactionIds: ["t1"], patch: {} }), /Nothing to update/);
  await assert.rejects(
    call(bulkUpdateForAi, ctx, { transactionIds: ["t1"], patch: { posted: "Feb 1" } }),
    /YYYY-MM-DD/,
  );
  await assert.rejects(
    call(bulkUpdateForAi, ctx, {
      transactionIds: Array.from({ length: 101 }, (_, i) => `t${i}`),
      patch: { section: "Food" },
    }),
    /at most 100/,
  );
});

test("merchant link and unlink keep merchant counts in sync", async () => {
  const { db, ctx, tables } = database();
  await db.insert("transactions", { ...baseTxn, transactionId: "t1", description: "STARBUCKS #1" });

  await call(updateForAi, ctx, { transactionId: "t1", patch: { merchant: "Starbucks" } });
  assert.equal(tables.merchants.length, 1);
  assert.equal(tables.merchants[0].transactionCount, 1);
  assert.equal(tables.transactions[0].merchantClean, "Starbucks");
  assert.equal(tables.transactions[0].merchantId, tables.merchants[0]._id);

  await call(updateForAi, ctx, { transactionId: "t1", patch: { merchant: null } });
  assert.equal(tables.merchants[0].transactionCount, 0);
  assert.equal(tables.transactions[0].merchantId, null);
  assert.equal(tables.transactions[0].merchantClean, null);
});

test("deleteForAi removes only owned rows and decrements merchant count", async () => {
  const { db, ctx, tables } = database();
  const merchantId = await db.insert("merchants", { userId: "alice", slug: "acme", name: "Acme", transactionCount: 2 });
  await db.insert("transactions", { ...baseTxn, transactionId: "t1", description: "A", merchantId });
  await db.insert("transactions", { ...baseTxn, transactionId: "t2", description: "B", merchantId });
  await db.insert("transactions", { ...baseTxn, userId: "bob", transactionId: "t-bob", description: "C" });

  const result = await call(deleteForAi, ctx, { transactionIds: ["t1", "t-bob"] });
  assert.deepEqual(result, { deleted: 1, missing: ["t-bob"] });
  assert.deepEqual(tables.transactions.map((r) => r.transactionId).sort(), ["t-bob", "t2"]);
  assert.equal(tables.merchants[0].transactionCount, 1);

  await assert.rejects(
    call(deleteForAi, ctx, { transactionIds: Array.from({ length: 26 }, (_, i) => `t${i}`) }),
    /at most 25/,
  );
});

test("createForAi inserts a manual line on an owned account with taxonomy and merchant", async () => {
  const { db, ctx, tables } = database();
  await db.insert("accounts", { userId: "alice", accountId: "chq", name: "Chequing", officialName: null, isoCurrencyCode: "CAD" });
  await db.insert("accounts", { userId: "bob", accountId: "bob-acct", name: "Bob Card", officialName: null, isoCurrencyCode: "USD" });

  const created = await call(createForAi, ctx, {
    account: "chequing",
    posted: "2026-03-01",
    description: "Cash lunch",
    amount: 14.25,
    subcategory: "Cafes",
    merchant: "Local Deli",
    tags: ["Cash"],
  });

  assert.match(created.transactionId, /^piggy-/);
  assert.equal(created.merchant, "Local Deli");
  assert.equal(created.subcategory, "Cafes");
  const row = tables.transactions[0];
  assert.equal(row.accountId, "chq");
  assert.equal(row.debit, 14.25);
  assert.equal(row.credit, null);
  assert.equal(row.source, "piggy");
  assert.equal(row.tags, "Cash");
  assert.equal(row.currency, "CAD");
  assert.equal(tables.merchants[0].transactionCount, 1);

  await assert.rejects(
    call(createForAi, ctx, { account: "Bob Card", posted: "2026-03-01", description: "x", amount: 1 }),
    /Account not found/,
  );
});

test("updateTaxonomy keeps its single-field contract on the shared cascade", async () => {
  const { db, ctx, tables } = database();
  await seedTaxonomy(db);
  await db.insert("transactions", { ...baseTxn, transactionId: "t1", description: "X" });
  const result = await call(updateTaxonomy, ctx, { transactionId: "t1", field: "category", value: "Dining" });
  assert.deepEqual(result, { transactionId: "t1", section: "Food", category: "Dining", subcategory: null, spread: "Wants" });
  assert.equal(tables.transactions[0].categoryLegacyId, 1);
});
