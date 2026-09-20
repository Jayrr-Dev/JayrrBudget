import {
  DEFAULT_PING_TYPES,
  PING_TYPES,
} from "@/domains/piggy-pings/domain/types";
import { api } from "@/shared/convex/httpClient";
import type { Id } from "@convex/_generated/dataModel";
import { tool } from "ai";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

const pingTypeSchema = z.enum(PING_TYPES);

const pingFields = {
  name: z.string().describe("Short label, e.g. Rent reminder"),
  title: z.string().describe("Headline shown on the ping"),
  message: z.string().describe("Body of the reminder"),
  pingTypes: z
    .array(pingTypeSchema)
    .min(1)
    .optional()
    .describe(
      "Toast, Email, Dialog (Popup), and/or Banner. Pick one or more. Toast is the default.",
    ),
  pingType: pingTypeSchema
    .optional()
    .describe("Single type if pingTypes is omitted."),
  cycle: z
    .string()
    .describe(
      "Comma list from start date, or None for no calendar repeat. Mix Weekly, Monthly, EOM, SOM, weekdays (Mon,Tue), a month-day (9/16), and a one-off date (9/16/26).",
    ),
  trigger: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Budget event name, e.g. Groceries + Warn, Groceries + Over, or Groceries + Warn + Over. Used when cycle is None.",
    ),
  startDate: z
    .string()
    .nullable()
    .optional()
    .describe("YYYY-MM-DD. Empty or null = indefinite start"),
  endDate: z
    .string()
    .nullable()
    .optional()
    .describe("YYYY-MM-DD. Empty or null = indefinite end"),
  notes: z.string().nullable().optional(),
  isActive: z
    .boolean()
    .optional()
    .describe("Whether the ping is on. Defaults to true."),
};

export function createPiggyPingTools(client: ConvexHttpClient) {
  return {
    list_piggy_pings: tool({
      description:
        "List this user's Pings reminders (name, title, types, cycle, dates).",
      inputSchema: z.object({}),
      execute: async () => {
        return await client.query(api.piggyPings.list, {});
      },
    }),

    create_piggy_ping: tool({
      description:
        "Create a ping reminder for the signed-in user. pingTypes can include Toast, Email, Popup (dialog), Banner. Toast is the default. Use cycle None plus trigger like Name + Warn for budget marks. Leave startDate or endDate empty for an open-ended window.",
      inputSchema: z.object(pingFields),
      execute: async (input) => {
        const fromList = input.pingTypes ?? [];
        const pingTypes =
          fromList.length > 0
            ? fromList
            : input.pingType
              ? [input.pingType]
              : DEFAULT_PING_TYPES;
        return await client.mutation(api.piggyPings.create, {
          name: input.name,
          title: input.title,
          message: input.message,
          pingTypes,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          notes: input.notes ?? null,
          trigger: input.trigger ?? null,
          cycle: input.cycle,
          isActive: input.isActive ?? true,
        });
      },
    }),

    delete_piggy_ping: tool({
      description:
        "Delete one of the signed-in user's Pings. Only after they ask to remove it. confirmed must be true.",
      inputSchema: z.object({
        pingId: z.string(),
        confirmed: z.boolean(),
      }),
      execute: async (input) => {
        if (!input.confirmed) {
          return {
            error:
              "Not deleted. Ask the user to confirm, then call again with confirmed: true.",
          };
        }
        await client.mutation(api.piggyPings.remove, {
          pingId: input.pingId as Id<"piggyPings">,
        });
        return { deleted: true, pingId: input.pingId };
      },
    }),
  };
}
