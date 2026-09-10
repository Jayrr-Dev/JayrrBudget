import { NextResponse } from "next/server";
import {
  getPlaidClient,
  PLAID_CLIENT_NAME,
  PLAID_COUNTRY_CODES,
  PLAID_PRODUCTS,
} from "@/lib/plaid";

export async function POST() {
  try {
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: {
        client_user_id: "jayrr-budget-owner",
      },
      client_name: PLAID_CLIENT_NAME,
      products: PLAID_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("create-link-token failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Plaid link token",
      },
      { status: 500 },
    );
  }
}
