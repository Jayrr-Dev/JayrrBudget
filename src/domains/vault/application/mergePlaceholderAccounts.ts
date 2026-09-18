import {
  deletePrivateRecords,
  type MutationClient,
} from "@/crypto/vaultRecords";
import { resolveAccountCategory } from "@/domains/dashboard/domain/accountCategory";
import { isPlaceholderManualAccountId } from "@/domains/statements/domain/parsedStatement";
import {
  encryptedTxValue,
  saveEncryptedRecords,
  type VaultWriteContext,
} from "@/domains/vault/application/saveEncryptedLedger";
import type {
  PrivateAccount,
  PrivateLedger,
  PrivateTransaction,
} from "@/domains/vault/domain/privateLedger";

const TX_CHUNK = 40;

type AccountSeed = Pick<
  PrivateAccount,
  "accountId" | "name" | "officialName" | "type" | "subtype"
>;

export function findSameCategoryKeeper(
  accounts: PrivateAccount[],
  from: AccountSeed,
): PrivateAccount | null {
  const category = resolveAccountCategory(from);
  const keepers = accounts.filter(
    (account) =>
      account.accountId !== from.accountId &&
      !isPlaceholderManualAccountId(account.accountId) &&
      resolveAccountCategory(account) === category,
  );
  if (keepers.length !== 1) return null;
  return keepers[0] ?? null;
}

/** Attach a failed-parse account id to the only real account of that type. */
export function resolveImportAccountId(
  accounts: PrivateAccount[] | undefined,
  payload: {
    accountId: string;
    accountName?: string | null;
    accountType: string;
    accountSubtype: string | null;
  },
) {
  if (!accounts || !isPlaceholderManualAccountId(payload.accountId)) {
    return payload.accountId;
  }
  const keeper = findSameCategoryKeeper(accounts, {
    accountId: payload.accountId,
    name: payload.accountName ?? payload.accountId,
    officialName: payload.accountName ?? null,
    type: payload.accountType,
    subtype: payload.accountSubtype,
  });
  return keeper?.accountId ?? payload.accountId;
}

function lineKey(tx: PrivateTransaction) {
  return [
    tx.accountId ?? "",
    tx.date,
    String(tx.amount),
    tx.description.trim().toLowerCase(),
    tx.pending ? "1" : "0",
  ].join("|");
}

async function dropSameLineTwins(
  ctx: VaultWriteContext,
  ledger: PrivateLedger,
): Promise<PrivateLedger> {
  const groups = new Map<string, PrivateTransaction[]>();
  for (const tx of ledger.transactions) {
    const key = lineKey(tx);
    const group = groups.get(key);
    if (group) group.push(tx);
    else groups.set(key, [tx]);
  }

  const extraIds: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) =>
      a.recordId.localeCompare(b.recordId),
    );
    extraIds.push(...ranked.slice(1).map((tx) => tx.recordId));
  }
  if (extraIds.length === 0) return ledger;

  const extra = new Set(extraIds);
  await deletePrivateRecords(ctx.client as unknown as MutationClient, {
    vaultId: ctx.vaultId,
    recordIds: extraIds,
  });
  return {
    ...ledger,
    transactions: ledger.transactions.filter((tx) => !extra.has(tx.recordId)),
  };
}

/**
 * Move txs off `manual-unknown-…-xxxx` onto the one real account of that
 * type, delete the leftover account, then drop same-line import twins.
 */
export async function mergePlaceholderAccounts(input: {
  ctx: VaultWriteContext;
  ledger: PrivateLedger;
}): Promise<PrivateLedger> {
  const placeholders = input.ledger.accounts.filter((account) =>
    isPlaceholderManualAccountId(account.accountId),
  );

  let accounts = [...input.ledger.accounts];
  let transactions = [...input.ledger.transactions];
  const removedIds: string[] = [];

  for (const placeholder of placeholders) {
    const keeper = findSameCategoryKeeper(accounts, placeholder);
    if (!keeper) continue;

    const matches = transactions.filter(
      (tx) => tx.accountId === placeholder.accountId,
    );
    const keepKeys = new Set(
      transactions
        .filter((tx) => tx.accountId === keeper.accountId)
        .map(lineKey),
    );
    const move: PrivateTransaction[] = [];
    for (const tx of matches) {
      const next = { ...tx, accountId: keeper.accountId };
      if (keepKeys.has(lineKey(next))) {
        removedIds.push(tx.recordId);
        continue;
      }
      keepKeys.add(lineKey(next));
      move.push(tx);
    }

    for (let i = 0; i < move.length; i += TX_CHUNK) {
      const chunk = move.slice(i, i + TX_CHUNK);
      await saveEncryptedRecords(
        input.ctx,
        chunk.map((tx) => {
          const next = { ...tx, accountId: keeper.accountId };
          const { recordId, revision, ...value } = next;
          return {
            recordId,
            kind: "tx" as const,
            value: encryptedTxValue(value),
            expectedRevision: revision,
          };
        }),
      );
      for (const tx of chunk) {
        tx.accountId = keeper.accountId;
        tx.revision += 1;
      }
    }

    removedIds.push(placeholder.recordId);
    accounts = accounts.filter(
      (account) => account.recordId !== placeholder.recordId,
    );
    const dropMoved = new Set(
      matches.filter((tx) => !move.includes(tx)).map((tx) => tx.recordId),
    );
    transactions = transactions.filter((tx) => !dropMoved.has(tx.recordId));
  }

  let ledger: PrivateLedger = input.ledger;
  if (removedIds.length > 0) {
    await deletePrivateRecords(input.ctx.client as unknown as MutationClient, {
      vaultId: input.ctx.vaultId,
      recordIds: removedIds,
    });
    ledger = { ...input.ledger, accounts, transactions };
  }

  return dropSameLineTwins(input.ctx, ledger);
}
