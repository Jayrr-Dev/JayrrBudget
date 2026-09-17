import { v } from "convex/values";
import { query } from "./_generated/server";
import { utcMonthKey } from "./lib/aiCostTable";
import { requireRole, userRole } from "./lib/auth";
import { shiftUtcMonthKey } from "./lib/utcKeys";
import { polarRevenueReturn, polarRevenueSnapshot } from "./polar";

const MONTH_SERIES = 12;
const USER_TAKE = 1_000;

const monthPointValidator = v.object({
  monthKey: v.string(),
  platformUsd: v.number(),
  byokUsd: v.number(),
  platformCalls: v.number(),
  byokCalls: v.number(),
});

function roundUsd(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export const dashboard = query({
  args: { now: v.number() },
  returns: v.object({
    kpis: v.object({
      monthPlatformUsd: v.number(),
      monthByokUsd: v.number(),
      prevPlatformUsd: v.number(),
      userCount: v.number(),
      costPerUser: v.number(),
      platformCalls: v.number(),
    }),
    months: v.array(monthPointValidator),
    polar: polarRevenueReturn,
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const now = Number.isFinite(args.now) ? args.now : 0;
    const thisMonth = utcMonthKey(now);
    const keys: string[] = [];
    for (let i = MONTH_SERIES - 1; i >= 0; i -= 1) {
      keys.push(shiftUtcMonthKey(thisMonth, -i));
    }

    const months = [];
    for (const monthKey of keys) {
      const rows = await ctx.db
        .query("aiUsageMonths")
        .withIndex("by_monthKey", (q) => q.eq("monthKey", monthKey))
        .take(500);
      let platformUsd = 0;
      let byokUsd = 0;
      let platformCalls = 0;
      let byokCalls = 0;
      for (const row of rows) {
        if (row.billedTo === "byok") {
          byokUsd += row.estimatedUsd;
          byokCalls += row.callCount;
        } else {
          platformUsd += row.estimatedUsd;
          platformCalls += row.callCount;
        }
      }
      months.push({
        monthKey,
        platformUsd: roundUsd(platformUsd),
        byokUsd: roundUsd(byokUsd),
        platformCalls,
        byokCalls,
      });
    }

    const current = months[months.length - 1] ?? {
      platformUsd: 0,
      byokUsd: 0,
      platformCalls: 0,
    };
    const previous = months[months.length - 2] ?? { platformUsd: 0 };
    const users = await ctx.db.query("users").take(USER_TAKE);
    const userCount = users.length;
    const costPerUser =
      userCount > 0 ? roundUsd(current.platformUsd / userCount) : 0;
    let premiumSubscribers = 0;
    for (const user of users) {
      if (userRole(user) === "premium") premiumSubscribers += 1;
    }

    return {
      kpis: {
        monthPlatformUsd: current.platformUsd,
        monthByokUsd: current.byokUsd,
        prevPlatformUsd: previous.platformUsd,
        userCount,
        costPerUser,
        platformCalls: current.platformCalls,
      },
      months,
      polar: await polarRevenueSnapshot(ctx, premiumSubscribers),
    };
  },
});
