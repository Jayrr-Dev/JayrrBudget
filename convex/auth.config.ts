import type { AuthConfig } from "convex/server";

/**
 * Convex Auth JWT validation.
 * Tokens are issued by this deployment's HTTP auth routes (CONVEX_SITE_URL).
 */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
