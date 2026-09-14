import "server-only";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { createConvexHttpClient } from "@/shared/convex/httpClient";

export class AuthRequiredError extends Error {
  status = 401 as const;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** Convex HTTP client authenticated as the current Convex Auth user. */
export async function getAuthenticatedConvexClient() {
  const token = await convexAuthNextjsToken();
  if (!token) {
    throw new AuthRequiredError();
  }
  const client = createConvexHttpClient();
  client.setAuth(token);
  return client;
}
