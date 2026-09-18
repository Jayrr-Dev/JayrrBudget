import assert from "node:assert/strict";
import { cleanMerchantDescriptor } from "../convex/lib/cleanMerchantDescriptor";
import { planDescriptorCleanMerges } from "../src/domains/merchants/domain/planDescriptorCleanMerges";

function check(input: string, expected: string) {
  const got = cleanMerchantDescriptor(input);
  assert.equal(got, expected, `${input} → ${got} (expected ${expected})`);
}

check("Pos Debit - Uber", "Uber");
check("POS DEBIT - STARBUCKS", "Starbucks");
check("POS DEBIT - PETRO-CANADA", "Petro-Canada");
check("POS DEBIT - HUDSON'S BAY", "Hudson's Bay");
check("INTERAC DEBIT - SAVE-ON-FOODS", "Save-On-Foods");
check("VISA DEBIT SKIPTHEDISHES", "SkipTheDishes");
check("Pad - Spotify", "Spotify");
check("PAD - MOVATI ATHLETIC", "Movati Athletic");
check("Interac E-transfer Out", "Interac E-transfer Out");
check("Tim Hortons", "Tim Hortons");

const merges = planDescriptorCleanMerges([
  {
    id: "a",
    name: "Pos Debit - Uber",
    slug: "pos-debit-uber",
    transactionCount: 12,
  },
  { id: "b", name: "Uber", slug: "uber", transactionCount: 3 },
  {
    id: "c",
    name: "Pos Debit - Ikea",
    slug: "pos-debit-ikea",
    transactionCount: 1,
  },
]);

assert.equal(merges.length, 2);
const uber = merges.find((row) => row.canonicalName === "Uber");
assert.ok(uber);
assert.deepEqual([...uber.merchantIds].sort(), ["a", "b"]);
const ikea = merges.find((row) => row.canonicalName === "Ikea");
assert.ok(ikea);
assert.deepEqual(ikea.merchantIds, ["c"]);

console.log("ok");
