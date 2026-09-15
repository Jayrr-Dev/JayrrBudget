import test from "node:test";
import assert from "node:assert/strict";
import { apply, lookup, pendingPage } from "../convex/categorization";
import { descriptionKey, taxonomyKey } from "../convex/lib/categorization";

function database() {
  const tables: Record<string, any[]> = { users: [{ _id: "alice" }, { _id: "bob" }] };
  const db = {
    query(table: string) {
      let conditions: [string, unknown][] = [];
      const rows = () => (tables[table] ?? []).filter(r => conditions.every(([k, value]) => r[k] === value));
      const query = {
        withIndex(_index: string, fn: (q: any) => unknown) {
          const builder = { eq(k: string, value: unknown) { conditions.push([k, value]); return builder; } };
          fn(builder); return query;
        },
        collect: async () => rows(), unique: async () => rows()[0] ?? null,
        first: async () => rows()[0] ?? null,
        paginate: async () => ({ page: rows(), isDone: true, continueCursor: "" }),
      };
      return query;
    },
    get: async (id: string) => Object.values(tables).flat().find(r => r._id === id) ?? null,
    insert: async (table: string, value: any) => {
      const rows = tables[table] ??= []; const id = `${table}-${rows.length}`;
      rows.push({ ...value, _id: id }); return id;
    },
    patch: async (id: string, value: any) => Object.assign((await db.get(id))!, value),
    delete: async (id: string) => { for (const key in tables) tables[key] = tables[key].filter(r => r._id !== id); },
  };
  const ctx = { db, auth: { getUserIdentity: async () => ({ subject: "alice|session" }) } };
  return { db, tables, ctx };
}

const call = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
const pathKey = taxonomyKey("Food", "Dining", "Cafes");
const profile = { pathKey, merchant: "Acme", spread: "Wants", transactionType: "Expense", txnCode: "purchase", channel: "other" };
const key = descriptionKey("ACME", 10);
const txn = { transactionId: "t1", userId: "alice", description: "ACME", amount: 10, updatedAt: 1, merchantClean: null, category: null };

test("rule lookups never return another user's memorized profile", async () => {
  const { db, ctx } = database();
  await db.insert("categorizationRules", { userId: "bob", key, profile });
  assert.deepEqual(await call(lookup, ctx, { keys: [key] }), [{ key, profile: null }]);
});

test("cannot categorize or read another user's statement", async () => {
  const { db, ctx } = database();
  await db.insert("statementUploads", { userId: "bob", uploadId: 1 });
  await assert.rejects(call(pendingPage, ctx, { uploadId: 1, paginationOpts: { cursor: null, numItems: 20 } }), /Statement not found/);
});

test("batch apply memorizes all fields, links owner modules, and reruns do no work", async () => {
  const { db, ctx, tables } = database();
  await db.insert("sharedCategoryPaths", { key: pathKey, section: "Food", category: "Dining", subcategory: "Cafes" });
  await db.insert("transactions", txn);
  const args = { groups: [{ key, profile, rows: [{ transactionId: "t1", updatedAt: 1 }] }] };
  assert.deepEqual(await call(apply, ctx, args), { applied: 1 });
  assert.deepEqual(tables.categorizationRules[0].profile, profile);
  assert.equal(tables.transactions[0].subcategory, "Cafes");
  assert.equal(tables.transactions[0].categoryLegacyId, tables.transactionCategories[0].legacyId);
  assert.deepEqual(await call(apply, ctx, args), { applied: 0 });
});

test("concurrent manual edits and foreign rows are not overwritten", async () => {
  const { db, ctx, tables } = database();
  await db.insert("sharedCategoryPaths", { key: pathKey, section: "Food", category: "Dining", subcategory: "Cafes" });
  await db.insert("transactions", { ...txn, updatedAt: 2 });
  await db.insert("transactions", { ...txn, userId: "bob", transactionId: "t2" });
  const result = await call(apply, ctx, { groups: [{ key, profile, rows: [{ transactionId: "t1", updatedAt: 1 }, { transactionId: "t2", updatedAt: 1 }] }] });
  assert.equal(result.applied, 0);
  assert.ok(tables.transactions.every(r => r.category === null));
  assert.equal(tables.categorizationRules, undefined);
});

test("rejects invented taxonomy paths before any ledger write", async () => {
  const { db, ctx, tables } = database();
  await db.insert("transactions", txn);
  await assert.rejects(call(apply, ctx, { groups: [{ key, profile, rows: [{ transactionId: "t1", updatedAt: 1 }] }] }), /existing category path/);
  assert.equal(tables.transactions[0].category, null);
});
