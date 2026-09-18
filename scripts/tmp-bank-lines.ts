import assert from "node:assert/strict";
import { planBankLineMerchantNames } from "../src/domains/merchants/domain/planBankLineMerchantNames";

const ledger = {
  merchants: [
    { recordId: "m1", revision: 1, merchantId: "monthly-plan-fee", name: "Monthly Plan Fee" },
    { recordId: "m2", revision: 1, merchantId: "credit-interest", name: "Credit Interest" },
    { recordId: "m3", revision: 1, merchantId: "winners", name: "Winners" },
    { recordId: "m4", revision: 1, merchantId: "overdraft-fee", name: "Overdraft Fee" },
    { recordId: "m5", revision: 1, merchantId: "cibc-monthly-plan-fee", name: "CIBC Monthly Plan Fee" },
  ],
  transactions: [
    { recordId: "t1", revision: 1, date: "2026-01-01", description: "MONTHLY PLAN FEE", amount: 4, currency: "CAD", merchantClean: "Monthly Plan Fee", statementRecordId: "s1" },
    { recordId: "t2", revision: 1, date: "2026-01-01", description: "CREDIT INTEREST", amount: -1, currency: "CAD", merchantClean: "Credit Interest", accountId: "acct-td" },
    { recordId: "t3", revision: 1, date: "2026-01-01", description: "WINNERS", amount: 30, currency: "CAD", merchantClean: "Winners", statementRecordId: "s1" },
    // Overdraft fee seen on two banks: ambiguous, leave alone.
    { recordId: "t4", revision: 1, date: "2026-01-01", description: "OVERDRAFT FEE", amount: 5, currency: "CAD", merchantClean: "Overdraft Fee", statementRecordId: "s1" },
    { recordId: "t5", revision: 1, date: "2026-01-02", description: "OVERDRAFT FEE", amount: 5, currency: "CAD", merchantClean: "Overdraft Fee", accountId: "acct-td" },
  ],
  statementLogs: [
    { recordId: "s1", institutionName: "Canadian Imperial Bank of Commerce" },
  ],
  accounts: [
    { recordId: "a1", revision: 1, accountId: "acct-td", name: "TD Every Day Chequing" },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plan = planBankLineMerchantNames(ledger as any);
plan.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
console.log(JSON.stringify(plan));

assert.equal(plan.length, 2);
assert.deepEqual(plan[0], {
  canonicalName: "CIBC Monthly Plan Fee",
  merchantIds: ["m1", "m5"],
});
assert.deepEqual(plan[1], {
  canonicalName: "TD Credit Interest",
  merchantIds: ["m2"],
});
console.log("ok");
