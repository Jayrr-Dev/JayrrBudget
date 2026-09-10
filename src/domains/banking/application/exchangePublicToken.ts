import { eq } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { accounts, plaidItems } from "@/shared/db/schema";
import {
  getPlaidClient,
  isPlaidEnabled,
  PLAID_TRANSACTIONS_DAYS_REQUESTED,
} from "@/domains/banking/infrastructure/plaid-client";

export type ExchangePublicTokenInput = {
  public_token: string;
  institution?: { institution_id?: string; name?: string };
};

export type ExchangePublicTokenResult =
  | {
      ok: true;
      item_id: string;
      accounts: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function exchangePublicToken(
  input: ExchangePublicTokenInput,
): Promise<ExchangePublicTokenResult> {
  if (!isPlaidEnabled()) {
    return {
      ok: false,
      status: 503,
      error: "Plaid is disabled (NEXT_PUBLIC_PLAID_ENABLED=false).",
    };
  }

  if (!input.public_token) {
    return {
      ok: false,
      status: 400,
      error: "public_token is required",
    };
  }

  try {
    const client = getPlaidClient();
    const exchange = await client.itemPublicTokenExchange({
      public_token: input.public_token,
    });

    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;
    const db = getDb();

    const existing = await db
      .select()
      .from(plaidItems)
      .where(eq(plaidItems.itemId, itemId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(plaidItems)
        .set({
          accessToken,
          institutionId: input.institution?.institution_id ?? null,
          institutionName: input.institution?.name ?? null,
          daysRequested: PLAID_TRANSACTIONS_DAYS_REQUESTED,
          cursor: null,
          updatedAt: new Date(),
        })
        .where(eq(plaidItems.itemId, itemId));
    } else {
      await db.insert(plaidItems).values({
        itemId,
        accessToken,
        institutionId: input.institution?.institution_id ?? null,
        institutionName: input.institution?.name ?? null,
        daysRequested: PLAID_TRANSACTIONS_DAYS_REQUESTED,
      });
    }

    const accountsResponse = await client.accountsGet({
      access_token: accessToken,
    });

    for (const account of accountsResponse.data.accounts) {
      const values = {
        plaidAccountId: account.account_id,
        itemId,
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

    return {
      ok: true,
      item_id: itemId,
      accounts: accountsResponse.data.accounts.length,
    };
  } catch (error) {
    console.error("exchange-public-token failed", error);
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to exchange public token",
    };
  }
}
