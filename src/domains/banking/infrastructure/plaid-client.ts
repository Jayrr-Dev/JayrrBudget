import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "plaid";

function getPlaidEnv() {
  const env = process.env.PLAID_ENV ?? "sandbox";

  if (env === "production") return PlaidEnvironments.production;
  if (env === "development") return PlaidEnvironments.development;
  return PlaidEnvironments.sandbox;
}

/** Feature flag — set NEXT_PUBLIC_PLAID_ENABLED=false to hide link/sync UI and reject Plaid APIs. */
export function isPlaidEnabled() {
  const flag = process.env.NEXT_PUBLIC_PLAID_ENABLED;
  if (flag === undefined || flag === "") return true;
  return flag !== "false" && flag !== "0";
}

export function isPlaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    throw new Error(
      "Missing PLAID_CLIENT_ID or PLAID_SECRET. Add them to .env.local.",
    );
  }

  const configuration = new Configuration({
    basePath: getPlaidEnv(),
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export const PLAID_PRODUCTS = [Products.Transactions];
/** Canada first (primary), US kept for cross-border institutions. */
export const PLAID_COUNTRY_CODES = [CountryCode.Ca, CountryCode.Us];
export const PLAID_CLIENT_NAME = "JayrrBudget";
/** Max history Plaid allows at Item creation (2 years). */
export const PLAID_TRANSACTIONS_DAYS_REQUESTED = 730;
export const PLAID_SYNC_PAGE_SIZE = 500;
