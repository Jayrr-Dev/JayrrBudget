import {
  buildPiggyMemoryLines,
  buildPiggyNameLines,
  PIGGY_MEMORY_RULES,
  type PiggyMemorySnapshot,
} from "@/domains/ledger-ai/domain/piggyMemoryPrompt";
import { api } from "@convex/_generated/api";
import { tool } from "ai";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

export type PiggyScope = "ledger" | "canvas";

const factList = z.array(z.string().min(1).max(240)).max(10);

/**
 * Loads name + memory for the signed-in user and returns system prompt lines.
 * Client is already authenticated, so Convex scopes everything to that owner.
 * Never throws: an empty memory beats a dead chat.
 */
export async function loadPiggyUserContext(client: ConvexHttpClient) {
  let name: string | null = null;
  let memory: PiggyMemorySnapshot | null = null;
  try {
    const [me, stored] = await Promise.all([
      client.query(api.users.me, {}),
      client.query(api.piggyMemory.get, {}),
    ]);
    name = me?.name ?? null;
    memory = stored;
  } catch (error) {
    console.warn(
      `[piggy-memory] load failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const lines = [
    ...buildPiggyNameLines(name, memory?.nickname ?? null),
    PIGGY_MEMORY_RULES,
  ];
  if (memory) {
    const remembered = buildPiggyMemoryLines(memory, Date.now());
    if (remembered.length > 0) lines.push("", ...remembered);
  }
  return { systemLines: lines, memory };
}

/** Tools Piggy uses to write to its own memory row for this user. */
export function createPiggyMemoryTools(client: ConvexHttpClient) {
  return {
    remember_about_user: tool({
      description:
        "Save facts about the signed-in user to Piggy's memory. Pass only the lists you are adding to. nickname replaces the stored nickname (empty string clears it). lastSessionSummary is one sentence about this chat.",
      inputSchema: z.object({
        nickname: z.string().max(24).optional(),
        basicInfo: factList.optional(),
        goals: factList.optional(),
        painPoints: factList.optional(),
        preferences: factList.optional(),
        wins: factList.optional(),
        followUps: factList.optional(),
        lastSessionSummary: z.string().max(400).optional(),
      }),
      execute: async (input) => {
        const saved = await client.mutation(api.piggyMemory.remember, input);
        return {
          ok: true,
          nickname: saved.nickname,
          counts: {
            basicInfo: saved.basicInfo.length,
            goals: saved.goals.length,
            painPoints: saved.painPoints.length,
            preferences: saved.preferences.length,
            wins: saved.wins.length,
            followUps: saved.followUps.length,
          },
        };
      },
    }),

    forget_about_user: tool({
      description:
        "Remove entries from one of Piggy's memory lists for the signed-in user. Entries must match the stored text.",
      inputSchema: z.object({
        field: z.enum([
          "basicInfo",
          "goals",
          "painPoints",
          "preferences",
          "wins",
          "followUps",
        ]),
        entries: z.array(z.string().min(1)).min(1).max(20),
      }),
      execute: async (input) => {
        const saved = await client.mutation(api.piggyMemory.forget, input);
        return { ok: true, remaining: saved[input.field].length };
      },
    }),
  };
}

/** Stamp the session after a chat finishes. Fire-and-forget safe. */
export async function recordPiggySession(
  client: ConvexHttpClient,
  scope: PiggyScope,
) {
  try {
    await client.mutation(api.piggyMemory.recordSession, { scope });
  } catch (error) {
    console.warn(
      `[piggy-memory] recordSession failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
