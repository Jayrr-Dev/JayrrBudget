import { getDb } from "@/shared/db";
import { accounts, plaidItems, transactions } from "@/shared/db/schema";
import {
  getPlaidClient,
  isPlaidConfigured,
} from "@/domains/banking/infrastructure/plaid-client";

export type RemoveItemsResult =
  | {
      ok: true;
      removed_items: number;
      message: string;
    }
  | {
      ok: false;
      status: number;
      code?: string;
      error: string;
    };

/** Remove all linked Plaid Items so you can re-link with a fresh 730-day history request. */
export async function removeItems(): Promise<RemoveItemsResult> {
  if (!isPlaidConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "PLAID_NOT_CONFIGURED",
      error: "Plaid is not configured",
    };
  }

  try {
    const client = getPlaidClient();
    const db = getDb();
    const items = await db.select().from(plaidItems);

    for (const item of items) {
      try {
        await client.itemRemove({ access_token: item.accessToken });
      } catch (error) {
        console.warn("itemRemove failed (continuing local wipe)", error);
      }
    }

    await db.delete(transactions);
    await db.delete(accounts);
    await db.delete(plaidItems);

    return {
      ok: true,
      removed_items: items.length,
      message:
        "Banks removed. Connect bank again to pull up to 2 years of history.",
    };
  } catch (error) {
    console.error("remove items failed", error);
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error ? error.message : "Failed to remove items",
    };
  }
}
