import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

/** Unauthenticated Convex HTTP client (scripts / rare cases). Prefer server auth helper. */
export function createConvexHttpClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }
  return new ConvexHttpClient(url);
}

/** @deprecated Prefer getAuthenticatedConvexClient from httpClient.server.ts */
export function getConvexHttpClient() {
  return createConvexHttpClient();
}

export { api };
