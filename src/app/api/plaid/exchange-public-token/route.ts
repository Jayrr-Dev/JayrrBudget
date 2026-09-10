import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { accounts, plaidItems } from "@/db/schema";
import { getPlaidClient } from "@/lib/plaid";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      public_token?: string;
      institution?: { institution_id?: string; name?: string };
    };

    if (!body.public_token) {
      return NextResponse.json(
        { error: "public_token is required" },
        { status: 400 },
      );
    }

    const client = getPlaidClient();
    const exchange = await client.itemPublicTokenExchange({
      public_token: body.public_token,
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
          institutionId: body.institution?.institution_id ?? null,
          institutionName: body.institution?.name ?? null,
          updatedAt: new Date(),
        })
        .where(eq(plaidItems.itemId, itemId));
    } else {
      await db.insert(plaidItems).values({
        itemId,
        accessToken,
        institutionId: body.institution?.institution_id ?? null,
        institutionName: body.institution?.name ?? null,
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

    return NextResponse.json({
      ok: true,
      item_id: itemId,
      accounts: accountsResponse.data.accounts.length,
    });
  } catch (error) {
    console.error("exchange-public-token failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to exchange public token",
      },
      { status: 500 },
    );
  }
}
