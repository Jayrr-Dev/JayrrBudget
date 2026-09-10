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
export const PLAID_COUNTRY_CODES = [CountryCode.Us];
export const PLAID_CLIENT_NAME = "JayrrBudget";
