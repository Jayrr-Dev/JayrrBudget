import test from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import { categorizeStatement } from "../src/domains/statements/application/categorizeStatement";
import { descriptionKey } from "../convex/lib/categorization";
import { aiState } from "./categorization-ai.fixture";

function client(count: number, repeated = true, cached = false) {
  Object.assign(aiState, { calls: 0, inputs: 0, fail: false, invalid: false, confident: true });
  const rows = Array.from({ length: count }, (_, i) => ({ transactionId: `t${i}`, description: repeated ? "ACME" : `ACME ${i}`,
    amount: 10, key: descriptionKey(repeated ? "ACME" : `ACME ${i}`, 10), updatedAt: 1 }));
  const saved = new Set<string>();
  const profile = { merchant: "Acme", pathKey: "food", spread: "Wants", transactionType: "Expense", txnCode: "purchase", channel: "other" };
  const rules = new Map(cached ? rows.map(r => [r.key, profile]) : []);
  return { saved, client: {
    query: async (fn: any, args: any) => {
      const name = getFunctionName(fn);
      if (name.endsWith(":pendingPage")) return { page: rows.filter(r => !saved.has(r.transactionId)), isDone: true, continueCursor: "" };
      if (name.endsWith(":lookup")) return args.keys.map((key: string) => ({ key, profile: rules.get(key) ?? null }));
      if (name.endsWith(":vocabulary")) return { paths: [{ key: "food", section: "Food", category: "Dining", subcategory: "Cafes" }], spreads: ["Wants"], types: ["Expense"] };
      throw new Error(name);
    },
    mutation: async (fn: any, args: any) => {
      if (getFunctionName(fn).endsWith(":publishOwnVocabulary")) return;
      const count = args.groups.reduce((n: number, g: any) => n + g.rows.length, 0);
      assert.ok(count <= 200); assert.ok(args.groups.length <= 40);
      for (const group of args.groups) {
        for (const row of group.rows) saved.add(row.transactionId);
        rules.set(group.key, group.profile);
      }
      return { applied: count };
    },
  } };
}

test("500 repeated transactions need one AI classification, and no AI on retry", async () => {
  const fixture = client(500);
  const result = await categorizeStatement(fixture.client as any, 1);
  assert.equal(aiState.calls, 1); assert.equal(aiState.inputs, 1);
  assert.deepEqual(result, { ok: true, cached: 0, ai: 500, pending: 0 });
  await categorizeStatement(fixture.client as any, 1);
  assert.equal(aiState.calls, 1);
});
test("known descriptions skip AI entirely", async () => {
  const fixture = client(100, false, true);
  const result = await categorizeStatement(fixture.client as any, 1);
  assert.equal(aiState.calls, 0); assert.equal(result.cached, 100); assert.equal(result.pending, 0);
});
test("81 unique descriptions use three bounded batches", async () => {
  const fixture = client(81, false);
  const result = await categorizeStatement(fixture.client as any, 1);
  assert.equal(aiState.calls, 3); assert.equal(result.ai, 81);
});
test("provider failure leaves all rows pending and retryable", async () => {
  const fixture = client(5);
  aiState.fail = true;
  const result = await categorizeStatement(fixture.client as any, 1);
  assert.equal(result.ok, false); assert.equal(result.pending, 5); assert.equal(fixture.saved.size, 0);
  aiState.fail = false;
  assert.equal((await categorizeStatement(fixture.client as any, 1)).ai, 5);
});
test("invalid AI IDs and low confidence never enter memory", async () => {
  for (const condition of ["invalid", "confident"] as const) {
    const fixture = client(5);
    aiState[condition] = condition === "invalid";
    const result = await categorizeStatement(fixture.client as any, 1);
    assert.equal(result.pending, 5); assert.equal(fixture.saved.size, 0);
  }
});
