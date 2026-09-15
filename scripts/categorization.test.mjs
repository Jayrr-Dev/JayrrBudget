import test from "node:test";
import assert from "node:assert/strict";
import { descriptionKey, taxonomyKey, isCategorized } from "../convex/lib/categorization.ts";

test("reuses descriptions across whitespace, case and explicit bank references", () => {
  assert.equal(descriptionKey("  ACME   SHOP REF: ABC123", 12), descriptionKey("acme shop ref: DEF456", 18));
});
test("never mixes money-in and money-out or distinct merchant services", () => {
  assert.notEqual(descriptionKey("ACME", 12), descriptionKey("ACME", -12));
  assert.notEqual(descriptionKey("UBER EATS", 12), descriptionKey("UBER TRIP", 12));
  assert.notEqual(descriptionKey("SHOP REFUND", -12), descriptionKey("SHOP PAYMENT", -12));
  assert.notEqual(descriptionKey("7 ELEVEN", 12), descriptionKey("ELEVEN", 12));
});
test("category path identity includes every parent and normalizes equivalent labels", () => {
  assert.equal(taxonomyKey(" FOOD ", "Dining", " Cafes "), taxonomyKey("food", "dining", "cafes"));
  assert.notEqual(taxonomyKey("Food", "Dining", "Other"), taxonomyKey("Travel", "Dining", "Other"));
});
test("partial profiles remain eligible; category-only paths are complete", () => {
  const row = { merchantClean: "Acme", section: "Food", category: "Dining", spread: "Wants", transactionType: "Expense", txnCode: "purchase", channel: "other" };
  assert.equal(isCategorized(row), true);
  assert.equal(isCategorized({ ...row, txnCode: null }), false);
});
