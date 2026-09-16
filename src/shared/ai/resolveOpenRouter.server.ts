import "server-only";

import { decryptOpenRouterKey } from "@/shared/ai/byokWrap.server";
import { OPENROUTER_NOT_CONFIGURED } from "@/shared/ai/openRouter";
import { api } from "@convex/_generated/api";
import type { ConvexHttpClient } from "convex/browser";

export async function resolveOpenRouterApiKey(client: ConvexHttpClient) {
  const material = await client.query(api.aiByok.getEncrypted, {});
  if (material) {
    try {
      return decryptOpenRouterKey(material);
    } catch (error) {
      console.error(
        "[byok] decrypt failed; falling back to OPENROUTER_API_KEY",
        error instanceof Error ? error.message : error,
      );
    }
  }
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  return envKey || undefined;
}

export async function loadOpenRouterKeyOr503(client: ConvexHttpClient) {
  const apiKey = await resolveOpenRouterApiKey(client);
  if (!apiKey) {
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
  return { ok: true as const, apiKey };
}
