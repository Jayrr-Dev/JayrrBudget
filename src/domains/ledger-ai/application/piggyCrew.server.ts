import { createLedgerAiTools, type LedgerAiToolOptions } from "@/domains/ledger-ai/application/createLedgerAiTools";
import { ASK_USER_TOOL_NAME } from "@/domains/ledger-ai/domain/askUserTool";
import { EXPORT_FILE_TOOL_NAME } from "@/domains/ledger-ai/domain/exportFileTool";
import { SHOW_SKETCH_TOOL_NAME } from "@/domains/ledger-ai/domain/sketchBoard";
import { persistAiUsage, type AiBilledTo } from "@/shared/ai/aiMeter.server";
import { chatModel } from "@/shared/ai/openRouter";
import { errorMessage } from "@/shared/lib/error-message";
import { api } from "@convex/_generated/api";
import { generateText, stepCountIs, tool } from "ai";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

const slotEnum = z.enum(["1", "2"]);

type CrewToolsOptions = {
  client: ConvexHttpClient;
  chatId: string;
  modelId: string;
  fallbacks: string[];
  billedTo: AiBilledTo;
  includeLedgerReads: boolean;
  storeSheetSnapshot?: LedgerAiToolOptions["storeSheetSnapshot"];
  helperContext?: string;
};

function mailLines(
  mail: Array<{ fromSlot: string; toSlot: string; body: string }>,
  slot: "1" | "2",
) {
  const relevant = mail.filter(
    (row) => row.fromSlot === slot || row.toSlot === slot,
  );
  if (relevant.length === 0) return "(no mail yet)";
  return relevant
    .slice(-12)
    .map((row) => `${row.fromSlot} → ${row.toSlot}: ${row.body}`)
    .join("\n");
}

async function runHelper(options: {
  client: ConvexHttpClient;
  chatId: string;
  slot: "1" | "2";
  task: string;
  modelId: string;
  fallbacks: string[];
  billedTo: AiBilledTo;
  includeLedgerReads: boolean;
  storeSheetSnapshot: CrewToolsOptions["storeSheetSnapshot"];
  helperContext?: string;
}) {
  const crew = await options.client.query(api.piggyCrew.list, {
    chatId: options.chatId,
  });
  const helper = crew.helpers.find((row) => row.slot === options.slot);
  if (!helper) {
    return { error: "That helper is not hired." };
  }

  await options.client.mutation(api.piggyCrew.post, {
    chatId: options.chatId,
    fromSlot: "lead",
    toSlot: options.slot,
    body: options.task,
  });

  const packed = createLedgerAiTools(options.client, {
    allowLedgerWrites: false,
    allowStoreSheetWrites: false,
    includeLedgerReads: options.includeLedgerReads,
    storeSheetSnapshot: options.storeSheetSnapshot,
  });
  const {
    [ASK_USER_TOOL_NAME]: _askUser,
    [EXPORT_FILE_TOOL_NAME]: _exportFile,
    [SHOW_SKETCH_TOOL_NAME]: _showSketch,
    ...readTools
  } = packed;
  const helperTools = {
    ...readTools,
    reply_to_lead: tool({
      description: "Send your findings back to lead Jev through the crew mail table.",
      inputSchema: z.object({ body: z.string().min(1).max(4000) }),
      execute: async ({ body }) => {
        return await options.client.mutation(api.piggyCrew.post, {
          chatId: options.chatId,
          fromSlot: options.slot,
          toSlot: "lead",
          body,
        });
      },
    }),
  };

  const startedAt = Date.now();
  const result = await generateText({
    model: chatModel(options.modelId, options.fallbacks),
    system: [
      `You are ${helper.name}, a helper hired by lead Jev for this user's budget.`,
      `Your job: ${helper.brief}`,
      "Read numbers with tools. Do not invent totals. Do not edit transactions.",
      "When you have an answer, call reply_to_lead with a short report, then stop.",
      "You are not a licensed planner.",
      options.helperContext
        ? `BUDGET SNAPSHOT:\n${options.helperContext.slice(0, 12_000)}`
        : "",
      "CREW MAIL:",
      mailLines(crew.mail, options.slot),
    ]
      .filter(Boolean)
      .join("\n"),
    prompt: options.task,
    tools: helperTools,
    stopWhen: stepCountIs(6),
    temperature: 0.3,
  });

  await persistAiUsage(options.client, options.billedTo, {
    source: "piggy-helper",
    modelId: options.modelId,
    usage: result.usage,
    ms: Date.now() - startedAt,
  });

  const report = result.text.trim();
  if (report) {
    await options.client.mutation(api.piggyCrew.post, {
      chatId: options.chatId,
      fromSlot: options.slot,
      toSlot: "lead",
      body: report,
    });
  }

  const next = await options.client.query(api.piggyCrew.list, {
    chatId: options.chatId,
  });
  const replies = next.mail.filter(
    (row) => row.fromSlot === options.slot && row.toSlot === "lead",
  );
  const last = replies.at(-1);
  return {
    helper: helper.name,
    slot: options.slot,
    report: (last?.body ?? report) || "(helper sent no mail)",
  };
}

/** Lead Piggy hires up to two helpers. They talk only through piggyCrew rows for this user. */
export function createPiggyCrewTools(options: CrewToolsOptions) {
  const chatId = options.chatId.trim() || "default";

  return {
    hire_piggy: tool({
      description:
        "Hire a helper for this chat (max 2). Helpers research and write to the crew mail table. You stay the advisor who talks to the user.",
      inputSchema: z.object({
        name: z.string().min(1).max(32),
        brief: z.string().min(1).max(400),
      }),
      execute: async ({ name, brief }) => {
        return await options.client.mutation(api.piggyCrew.hire, {
          chatId,
          name,
          brief,
        });
      },
    }),

    list_piggy_crew: tool({
      description:
        "List hired helpers and recent crew mail for this chat. Mail is stored in Convex, locked to this user.",
      inputSchema: z.object({}),
      execute: async () => {
        return await options.client.query(api.piggyCrew.list, { chatId });
      },
    }),

    ask_piggy_helper: tool({
      description:
        "Send a task to helper slot 1 or 2. Writes mail in the database, runs that helper, then returns their report from the same table.",
      inputSchema: z.object({
        slot: slotEnum,
        task: z.string().min(1).max(2000),
      }),
      execute: async ({ slot, task }) => {
        try {
          return await runHelper({
            client: options.client,
            chatId,
            slot,
            task,
            modelId: options.modelId,
            fallbacks: options.fallbacks,
            billedTo: options.billedTo,
            includeLedgerReads: options.includeLedgerReads,
            storeSheetSnapshot: options.storeSheetSnapshot,
            helperContext: options.helperContext,
          });
        } catch (error) {
          return {
            error: errorMessage(error, "Helper failed"),
          };
        }
      },
    }),

    dismiss_piggy: tool({
      description: "Let go of helper slot 1 or 2 for this chat.",
      inputSchema: z.object({ slot: slotEnum }),
      execute: async ({ slot }) => {
        return await options.client.mutation(api.piggyCrew.dismiss, {
          chatId,
          slot,
        });
      },
    }),
  };
}
