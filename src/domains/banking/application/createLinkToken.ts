import {
  getPlaidClient,
  isPlaidConfigured,
  isPlaidEnabled,
  PLAID_CLIENT_NAME,
  PLAID_COUNTRY_CODES,
  PLAID_PRODUCTS,
  PLAID_TRANSACTIONS_DAYS_REQUESTED,
} from "@/domains/banking/infrastructure/plaid-client";

export type CreateLinkTokenResult =
  | {
      ok: true;
      link_token: string;
      days_requested: number;
    }
  | {
      ok: false;
      status: number;
      code?: string;
      error: string;
    };

export async function createLinkToken(): Promise<CreateLinkTokenResult> {
  if (!isPlaidEnabled()) {
    return {
      ok: false,
      status: 503,
      code: "PLAID_DISABLED",
      error: "Plaid is disabled (NEXT_PUBLIC_PLAID_ENABLED=false).",
    };
  }

  if (!isPlaidConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "PLAID_NOT_CONFIGURED",
      error:
        "Missing PLAID_CLIENT_ID or PLAID_SECRET. Add them to .env.local.",
    };
  }

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
      transactions: {
        days_requested: PLAID_TRANSACTIONS_DAYS_REQUESTED,
      },
    });

    return {
      ok: true,
      link_token: response.data.link_token,
      days_requested: PLAID_TRANSACTIONS_DAYS_REQUESTED,
    };
  } catch (error) {
    console.error("create-link-token failed", error);
    return {
      ok: false,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create Plaid link token",
    };
  }
}
