import "server-only";

import type { AiBilledTo } from "@/shared/ai/aiUsageSink";
import { decryptByokKey } from "@/shared/ai/byokWrap.server";
import { api } from "@convex/_generated/api";
import type { ConvexHttpClient } from "convex/browser";

export type ResolvedJev = {
  apiKey: string;
  billedTo: AiBilledTo;
};

/** Personal Jev key when Profile has one. Otherwise the server key. */
export async function resolveJevApiKey(
  client: ConvexHttpClient,
): Promise<ResolvedJev | undefined> {
  const material = await client.query(api.aiByok.getEncrypted, {
    provider: "jev",
  });
  if (material) {
    try {
      return {
        apiKey: decryptByokKey("jev", material),
        billedTo: "byok",
      };
    } catch (error) {
      console.error(
        "[byok] jev decrypt failed; falling back to JEV_API_KEY",
        error instanceof Error ? error.message : error,
      );
    }
  }
  const envKey = process.env.JEV_API_KEY?.trim();
  if (!envKey) return undefined;
  return { apiKey: envKey, billedTo: "platform" };
}
