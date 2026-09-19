import { api } from "@/shared/convex/httpClient";
import { tool } from "ai";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

const budgetFields = {
  name: z.string().describe("Short label, e.g. Groceries"),
  amount: z.number().describe("Spend cap in the user's currency"),
  classLookup: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Section, category, or subcategory name from list_taxonomy. Empty or null = no class match yet",
    ),
  descriptionLookup: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Merchant or description fragment to match later. Empty or null = none",
    ),
  warningThreshold: z
    .number()
    .optional()
    .describe("Percent of amount that should warn. Default 80"),
  overageThreshold: z
    .number()
    .optional()
    .describe("Percent of amount that counts as over. Default 100"),
  cycle: z
    .enum(["daily", "weekly", "biweekly", "monthly", "yearly"])
    .optional()
    .describe(
      "How often the cap resets. daily, weekly, biweekly, monthly, or yearly. Default monthly",
    ),
  startDate: z
    .string()
    .nullable()
    .optional()
    .describe("YYYY-MM-DD the cycle slice starts from. Empty or null = today"),
};

export function createBudgetTools(client: ConvexHttpClient) {
  return {
    list_budgets: tool({
      description:
        "List this user's active spend budgets (name, class, description match, amount, cycle, start date, thresholds). Deactivated budgets are omitted and do not warn.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await client.query(api.budgets.list, {});
        return rows.filter((row) => row.isActive);
      },
    }),

    create_budget: tool({
      description:
        "Create a spend budget for the signed-in user. amount is the cap for the current cycle slice. cycle is daily, weekly, biweekly, monthly, or yearly (default monthly). startDate is YYYY-MM-DD (default today). warningThreshold and overageThreshold are percents of that cap (defaults 80 and 100). Use list_taxonomy before inventing a classLookup name.",
      inputSchema: z.object(budgetFields),
      execute: async (input) => {
        return await client.mutation(api.budgets.create, {
          name: input.name,
          amount: input.amount,
          classLookup: input.classLookup ?? null,
          descriptionLookup: input.descriptionLookup ?? null,
          warningThreshold: input.warningThreshold,
          overageThreshold: input.overageThreshold,
          isActive: true,
          cycle: input.cycle,
          startDate: input.startDate ?? null,
        });
      },
    }),
  };
}
