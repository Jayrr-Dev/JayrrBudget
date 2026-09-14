import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createConvexHttpClient } from "@/shared/convex/httpClient";

export class AuthRequiredError extends Error {
  status = 401 as const;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/**
 * Convex HTTP client authenticated as the current Clerk user.
 * Requires the Clerk JWT template named "convex".
 */
export async function getAuthenticatedConvexClient() {
  const session = await auth();
  if (!session.userId) {
    throw new AuthRequiredError();
  }
  const token = await session.getToken({ template: "convex" });
  if (!token) {
    throw new AuthRequiredError(
      "Missing Convex JWT — enable the Clerk Convex integration / JWT template.",
    );
  }
  const client = createConvexHttpClient();
  client.setAuth(token);
  return client;
}
