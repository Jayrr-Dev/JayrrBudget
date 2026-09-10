/**
 * One-time cleanup: collapse re-uploaded statement duplicates onto a stable
 * account + content fingerprint, matching the new import path.
 *
 * Usage: node scripts/cleanup-statement-dupes.mjs
 */
import { createHash } from "node:crypto";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.DATABASE_URL || "file:./data/jayrr-budget.db",
});

function normalize(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™©]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function manualAccountId({ institutionName, accountMask, accountType }) {
  const institution =
    normalize(institutionName || "unknown").replace(/\s+/g, "-").slice(0, 40) ||
    "unknown";
  const mask =
    String(accountMask || "")
      .replace(/\D/g, "")
      .slice(-4) || "xxxx";
  const type = accountType || "other";
  return `manual-${institution}-${type}-${mask}`;
}

function statementTransactionId(
  accountId,
  date,
  description,
  amount,
  occurrenceIndex,
) {
  const digest = createHash("sha256")
    .update(
      `${accountId}|${date}|${normalize(description)}|${amount}|${occurrenceIndex}`,
    )
    .digest("hex")
    .slice(0, 24);
  return `stmt_${digest}`;
}

async function ensureColumns() {
  const alters = [
    "ALTER TABLE statement_uploads ADD COLUMN file_hash TEXT",
    "ALTER TABLE statement_uploads ADD COLUMN inserted_count INTEGER DEFAULT 0",
    "ALTER TABLE statement_uploads ADD COLUMN updated_count INTEGER DEFAULT 0",
    "ALTER TABLE statement_uploads ADD COLUMN skipped_count INTEGER DEFAULT 0",
  ];
  for (const sql of alters) {
    try {
      await client.execute(sql);
    } catch {
      // already exists
    }
  }
  try {
    await client.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS statement_uploads_file_hash_uidx ON statement_uploads(file_hash)",
    );
  } catch {
    // ignore
  }
}

async function main() {
  await ensureColumns();

  const accounts = (
    await client.execute(
      `SELECT plaid_account_id, name, official_name, mask, type, subtype
       FROM accounts WHERE item_id = 'manual-statements'`,
    )
  ).rows;

  const accountMeta = new Map();
  for (const a of accounts) {
    const accountType =
      a.type === "credit" || a.subtype === "credit card"
        ? "credit"
        : a.subtype === "savings"
          ? "savings"
          : a.subtype === "checking"
            ? "checking"
            : "other";
    const stableId = manualAccountId({
      institutionName: a.official_name || a.name,
      accountMask: a.mask,
      accountType,
    });
    accountMeta.set(a.plaid_account_id, {
      stableId,
      institutionName: a.official_name || a.name,
      mask: a.mask,
      accountType,
    });
  }

  // Ensure stable accounts exist (copy from any legacy row).
  for (const a of accounts) {
    const meta = accountMeta.get(a.plaid_account_id);
    if (!meta) continue;
    const existing = await client.execute({
      sql: `SELECT plaid_account_id FROM accounts WHERE plaid_account_id = ?`,
      args: [meta.stableId],
    });
    if (existing.rows.length === 0) {
      await client.execute({
        sql: `INSERT INTO accounts (
          plaid_account_id, item_id, name, official_name, mask, type, subtype,
          current_balance, available_balance, iso_currency_code, updated_at
        )
        SELECT ?, item_id, name, official_name, mask, type, subtype,
               current_balance, available_balance, iso_currency_code, ?
        FROM accounts WHERE plaid_account_id = ?`,
        args: [meta.stableId, Date.now(), a.plaid_account_id],
      });
      console.log("created stable account", meta.stableId);
    }
  }

  const txns = (
    await client.execute(
      `SELECT id, plaid_transaction_id, account_id, name, amount, date,
              statement_upload_id
       FROM transactions
       WHERE source = 'statement'
       ORDER BY statement_upload_id DESC, id DESC`,
    )
  ).rows;

  const groups = new Map();
  for (const row of txns) {
    const meta = accountMeta.get(row.account_id);
    const stableAccountId = meta?.stableId || row.account_id;
    const key = `${stableAccountId}|${row.date}|${row.amount}|${normalize(row.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...row, stableAccountId });
  }

  const occurrence = new Map();
  let kept = 0;
  let deleted = 0;
  let rekeyed = 0;

  for (const [, group] of groups) {
    // Prefer newest upload, then newest id (already sorted DESC).
    const keeper = group[0];
    const drop = group.slice(1);

    const occBase = `${keeper.stableAccountId}|${keeper.date}|${keeper.amount}|${normalize(keeper.name)}`;
    const occIndex = occurrence.get(occBase) ?? 0;
    occurrence.set(occBase, occIndex + 1);

    const newExternalId = statementTransactionId(
      keeper.stableAccountId,
      keeper.date,
      keeper.name,
      keeper.amount,
      occIndex,
    );

    // If another row already owns the target fingerprint id, delete this keeper too
    // after moving nothing (rare during migration).
    const conflict = await client.execute({
      sql: `SELECT id FROM transactions WHERE plaid_transaction_id = ? AND id != ?`,
      args: [newExternalId, keeper.id],
    });

    if (conflict.rows.length > 0) {
      // Target fingerprint already present: drop entire group including keeper.
      for (const row of group) {
        await client.execute({
          sql: `DELETE FROM transactions WHERE id = ?`,
          args: [row.id],
        });
        deleted += 1;
      }
      continue;
    }

    if (
      keeper.plaid_transaction_id !== newExternalId ||
      keeper.account_id !== keeper.stableAccountId
    ) {
      await client.execute({
        sql: `UPDATE transactions
              SET plaid_transaction_id = ?, account_id = ?, updated_at = ?
              WHERE id = ?`,
        args: [
          newExternalId,
          keeper.stableAccountId,
          Date.now(),
          keeper.id,
        ],
      });
      rekeyed += 1;
    }
    kept += 1;

    for (const row of drop) {
      await client.execute({
        sql: `DELETE FROM transactions WHERE id = ?`,
        args: [row.id],
      });
      deleted += 1;
    }
  }

  // Drop legacy per-upload accounts that have no transactions left.
  const leftoverAccounts = (
    await client.execute(
      `SELECT a.plaid_account_id,
              (SELECT count(1) FROM transactions t WHERE t.account_id = a.plaid_account_id) AS txn_count
       FROM accounts a
       WHERE a.item_id = 'manual-statements'`,
    )
  ).rows;

  let accountsDeleted = 0;
  for (const a of leftoverAccounts) {
    const isLegacy = String(a.plaid_account_id).startsWith("manual-stmt-");
    if (isLegacy && Number(a.txn_count) === 0) {
      await client.execute({
        sql: `DELETE FROM accounts WHERE plaid_account_id = ?`,
        args: [a.plaid_account_id],
      });
      accountsDeleted += 1;
    }
  }

  const after = (
    await client.execute(
      `SELECT count(1) AS c FROM transactions WHERE source = 'statement'`,
    )
  ).rows[0];

  const afterAccounts = (
    await client.execute(
      `SELECT plaid_account_id, name, mask FROM accounts WHERE item_id = 'manual-statements'`,
    )
  ).rows;

  console.log(
    JSON.stringify(
      {
        kept,
        deleted,
        rekeyed,
        accountsDeleted,
        statementTxnsAfter: Number(after.c),
        accountsAfter: afterAccounts,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
