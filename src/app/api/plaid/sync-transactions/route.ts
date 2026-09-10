import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, plaidItems, transactions } from "@/db/schema";
import { getPlaidClient } from "@/lib/plaid";

export async function POST() {
  try {
    const client = getPlaidClient();
    const db = getDb();
    const items = await db.select().from(plaidItems);

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No linked banks yet",
        synced: 0,
      });
    }

    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    for (const item of items) {
      let cursor = item.cursor ?? undefined;
      let hasMore = true;

      while (hasMore) {
        const response = await client.transactionsSync({
          access_token: item.accessToken,
          cursor,
          options: {
            include_personal_finance_category: true,
          },
        });

        const data = response.data;

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
          await db
            .insert(transactions)
            .values({
              plaidTransactionId: txn.transaction_id,
              accountId: txn.account_id,
              itemId: item.itemId,
              name: txn.name,
              merchantName: txn.merchant_name ?? null,
              amount: txn.amount,
              isoCurrencyCode: txn.iso_currency_code ?? "USD",
              date: txn.date,
              authorizedDate: txn.authorized_date ?? null,
              pending: txn.pending,
              categoryPrimary:
                txn.personal_finance_category?.primary ?? null,
              categoryDetailed:
                txn.personal_finance_category?.detailed ?? null,
              paymentChannel: txn.payment_channel ?? null,
            })
            .onConflictDoUpdate({
              target: transactions.plaidTransactionId,
              set: {
                name: txn.name,
                merchantName: txn.merchant_name ?? null,
                amount: txn.amount,
                date: txn.date,
                pending: txn.pending,
                categoryPrimary:
                  txn.personal_finance_category?.primary ?? null,
                categoryDetailed:
                  txn.personal_finance_category?.detailed ?? null,
                updatedAt: new Date(),
              },
            });
          addedCount += 1;
        }

        for (const txn of data.modified) {
          await db
            .update(transactions)
            .set({
              name: txn.name,
              merchantName: txn.merchant_name ?? null,
              amount: txn.amount,
              date: txn.date,
              pending: txn.pending,
              categoryPrimary:
                txn.personal_finance_category?.primary ?? null,
              categoryDetailed:
                txn.personal_finance_category?.detailed ?? null,
              updatedAt: new Date(),
            })
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
        .set({ cursor: cursor ?? null, updatedAt: new Date() })
        .where(eq(plaidItems.itemId, item.itemId));
    }

    return NextResponse.json({
      ok: true,
      added: addedCount,
      modified: modifiedCount,
      removed: removedCount,
    });
  } catch (error) {
    console.error("sync-transactions failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync transactions",
      },
      { status: 500 },
    );
  }
}
