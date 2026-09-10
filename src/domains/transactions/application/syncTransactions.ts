import { eq } from "drizzle-orm";
import {
  getPlaidClient,
  isPlaidEnabled,
  PLAID_SYNC_PAGE_SIZE,
  PLAID_TRANSACTIONS_DAYS_REQUESTED,
} from "@/domains/banking/infrastructure/plaid-client";
import { mapPlaidTransaction } from "@/domains/transactions/domain/mapPlaidTransaction";
import { getDb } from "@/shared/db";
import { accounts, plaidItems, transactions } from "@/shared/db/schema";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAxiosLikeError(
  error: unknown,
): error is {
  response?: { data?: { error_code?: string; error_message?: string } };
} {
  return typeof error === "object" && error !== null;
}

export type SyncTransactionsInput = {
  resetCursor?: boolean;
  waitForHistory?: boolean;
};

export type SyncTransactionsResult =
  | {
      ok: true;
      message?: string;
      synced?: number;
      added?: number;
      modified?: number;
      removed?: number;
      pages?: number;
      earliest_date?: string | null;
      latest_date?: string | null;
      days_requested?: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function syncTransactions(
  input: SyncTransactionsInput = {},
): Promise<SyncTransactionsResult> {
  if (!isPlaidEnabled()) {
    return {
      ok: false,
      status: 503,
      error: "Plaid is disabled (NEXT_PUBLIC_PLAID_ENABLED=false).",
    };
  }

  try {
    const client = getPlaidClient();
    const db = getDb();
    const items = await db.select().from(plaidItems);

    if (items.length === 0) {
      return {
        ok: true,
        message: "No linked banks yet",
        synced: 0,
      };
    }

    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;
    let pages = 0;
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    const noteDate = (date: string) => {
      if (!earliestDate || date < earliestDate) earliestDate = date;
      if (!latestDate || date > latestDate) latestDate = date;
    };

    for (const item of items) {
      if (input.resetCursor) {
        await db
          .update(plaidItems)
          .set({ cursor: null, updatedAt: new Date() })
          .where(eq(plaidItems.itemId, item.itemId));
      }

      let cursor = input.resetCursor ? undefined : (item.cursor ?? undefined);
      let hasMore = true;
      let emptyRetries = 0;
      const maxEmptyRetries = input.waitForHistory === false ? 0 : 8;

      while (hasMore) {
        let response;

        try {
          response = await client.transactionsSync({
            access_token: item.accessToken,
            cursor,
            count: PLAID_SYNC_PAGE_SIZE,
            options: {
              include_original_description: true,
              include_personal_finance_category: true,
              days_requested: PLAID_TRANSACTIONS_DAYS_REQUESTED,
            },
          });
        } catch (error) {
          const code = isAxiosLikeError(error)
            ? error.response?.data?.error_code
            : undefined;

          if (
            (code === "PRODUCT_NOT_READY" ||
              code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") &&
            emptyRetries < maxEmptyRetries
          ) {
            emptyRetries += 1;
            await sleep(1500 * emptyRetries);
            continue;
          }

          throw error;
        }

        const data = response.data;
        pages += 1;

        const pageAdds = data.added.length;
        const pageMods = data.modified.length;
        const pageRemoves = data.removed.length;

        if (
          !cursor &&
          pageAdds === 0 &&
          pageMods === 0 &&
          pageRemoves === 0 &&
          !data.has_more &&
          emptyRetries < maxEmptyRetries
        ) {
          emptyRetries += 1;
          await sleep(1500 * emptyRetries);
          continue;
        }

        for (const account of data.accounts) {
          const values = {
            plaidAccountId: account.account_id,
            itemId: item.itemId,
            name: account.name,
            officialName: account.official_name ?? null,
            mask: account.mask ?? null,
            type: account.type,
            subtype: account.subtype ?? null,
            currentBalance: account.balances.current ?? null,
            availableBalance: account.balances.available ?? null,
            isoCurrencyCode: account.balances.iso_currency_code ?? "USD",
            updatedAt: new Date(),
          };

          const existingAccount = await db
            .select()
            .from(accounts)
            .where(eq(accounts.plaidAccountId, account.account_id))
            .limit(1);

          if (existingAccount[0]) {
            await db
              .update(accounts)
              .set(values)
              .where(eq(accounts.plaidAccountId, account.account_id));
          } else {
            await db.insert(accounts).values(values);
          }
        }

        for (const txn of data.added) {
          const row = mapPlaidTransaction(txn, item.itemId);
          noteDate(row.date);

          await db
            .insert(transactions)
            .values(row)
            .onConflictDoUpdate({
              target: transactions.plaidTransactionId,
              set: row,
            });
          addedCount += 1;
        }

        for (const txn of data.modified) {
          const row = mapPlaidTransaction(txn, item.itemId);
          noteDate(row.date);

          await db
            .update(transactions)
            .set(row)
            .where(eq(transactions.plaidTransactionId, txn.transaction_id));
          modifiedCount += 1;
        }

        for (const removed of data.removed) {
          if (!removed.transaction_id) continue;
          await db
            .delete(transactions)
            .where(
              eq(transactions.plaidTransactionId, removed.transaction_id),
            );
          removedCount += 1;
        }

        hasMore = data.has_more;
        cursor = data.next_cursor;
      }

      await db
        .update(plaidItems)
        .set({
          cursor: cursor ?? null,
          daysRequested: PLAID_TRANSACTIONS_DAYS_REQUESTED,
          updatedAt: new Date(),
        })
        .where(eq(plaidItems.itemId, item.itemId));
    }

    return {
      ok: true,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
      pages,
      earliest_date: earliestDate,
      latest_date: latestDate,
      days_requested: PLAID_TRANSACTIONS_DAYS_REQUESTED,
    };
  } catch (error) {
    console.error("sync-transactions failed", error);
    const message = isAxiosLikeError(error)
      ? error.response?.data?.error_message
      : undefined;

    return {
      ok: false,
      status: 500,
      error:
        message ??
        (error instanceof Error
          ? error.message
          : "Failed to sync transactions"),
    };
  }
}
