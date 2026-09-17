import { PING_TYPES } from "@/domains/piggy-pings/domain/types";
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
    .describe("Toast, Email, Popup, and/or Banner. Pick one or more."),
  pingType: pingTypeSchema
    .optional()
    .describe("Single type if pingTypes is omitted."),
  cycle: z
    .string()
    .describe(
      "Comma list from start date. Mix Weekly, Monthly, EOM, SOM, weekdays (Mon,Tue), a month-day (9/16), and a one-off date (9/16/26).",
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
        "List this user's Piggy Pings reminders (name, title, types, cycle, dates).",
      inputSchema: z.object({}),
      execute: async () => {
        return await client.query(api.piggyPings.list, {});
      },
    }),

    create_piggy_ping: tool({
      description:
        "Create a Piggy Ping reminder for the signed-in user. Pass pingTypes for one or more of Toast, Email, Popup, Banner. Leave startDate or endDate empty for an open-ended window. Do not set trigger; that comes later.",
      inputSchema: z.object(pingFields),
      execute: async (input) => {
        const pingTypes =
          input.pingTypes && input.pingTypes.length > 0
            ? input.pingTypes
            : input.pingType
              ? [input.pingType]
              : [];
        return await client.mutation(api.piggyPings.create, {
          name: input.name,
          title: input.title,
          message: input.message,
          pingTypes,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          notes: input.notes ?? null,
          trigger: null,
          cycle: input.cycle,
          isActive: input.isActive ?? true,
        });
      },
    }),

    delete_piggy_ping: tool({
      description:
        "Delete one of the signed-in user's Piggy Pings. Only after they ask to remove it. confirmed must be true.",
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
