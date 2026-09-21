import "server-only";

import { decryptOpenRouterKey } from "@/shared/ai/byokWrap.server";
import { OPENROUTER_NOT_CONFIGURED } from "@/shared/ai/openRouter";
import type { AiBilledTo } from "@/shared/ai/aiUsageSink";
import { api } from "@convex/_generated/api";
import type { ConvexHttpClient } from "convex/browser";

export type ResolvedOpenRouter = {
  apiKey: string;
  billedTo: AiBilledTo;
};

export async function resolveOpenRouterApiKey(
  client: ConvexHttpClient,
): Promise<ResolvedOpenRouter | undefined> {
  const material = await client.query(api.aiByok.getEncrypted, {
    provider: "openrouter",
  });
  if (material) {
    try {
      return {
        apiKey: decryptOpenRouterKey(material),
        billedTo: "byok",
      };
    } catch (error) {
      console.error(
        "[byok] decrypt failed; falling back to OPENROUTER_API_KEY",
        error instanceof Error ? error.message : error,
      );
    }
  }
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!envKey) return undefined;
  return { apiKey: envKey, billedTo: "platform" };
}

export async function loadOpenRouterKeyOr503(client: ConvexHttpClient) {
  const resolved = await resolveOpenRouterApiKey(client);
  if (!resolved) {
    return {
      ok: false as const,
      response: Response.json(
        {
          error: OPENROUTER_NOT_CONFIGURED,
          code: "OPENROUTER_NOT_CONFIGURED",
        },
        { status: 503 },
      ),
    };
  }
  return { ok: true as const, ...resolved };
}
