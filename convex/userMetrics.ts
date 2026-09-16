import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireRole, requireUser, userRole } from "./lib/auth";
import type { UserRole } from "./lib/roles";
import {
  addUtcDays,
  utcDayKey,
  utcDayStart,
  utcWeekStart,
} from "./lib/utcKeys";

const HEARTBEAT_MAX_MS = 90_000;
const HEARTBEAT_MIN_MS = 1_000;
const USER_TAKE = 1_000;
const DAY_SERIES = 14;
const USAGE_LOOKBACK = 30;
const WEEK_SERIES = 12;
const ROSTER_TAKE = 12;

const kpiValidator = v.object({
  totalUsers: v.number(),
  newThisWeek: v.number(),
  newThisMonth: v.number(),
  dau: v.number(),
  wau: v.number(),
  mau: v.number(),
  todayHours: v.number(),
  todayMedianMinutes: v.number(),
});

const weekPointValidator = v.object({
  weekStart: v.number(),
  label: v.string(),
  signups: v.number(),
});

const dayPointValidator = v.object({
  dayKey: v.string(),
  label: v.string(),
  activeUsers: v.number(),
  hours: v.number(),
});

const rolePointValidator = v.object({
  role: v.string(),
  count: v.number(),
});

const rosterRowValidator = v.object({
  userId: v.id("users"),
  email: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  role: v.string(),
  createdAt: v.number(),
  lastSeenAt: v.union(v.number(), v.null()),
  weekMs: v.number(),
});

function createdAtMs(user: Doc<"users">) {
  return user.createdAt ?? user._creationTime;
}

function shortDayLabel(dayStartMs: number) {
  const d = new Date(dayStartMs);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function weekLabel(weekStartMs: number) {
  const d = new Date(weekStartMs);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const even = sorted.length % 2 === 0;
  if (even) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

async function loadDays(ctx: QueryCtx, dayKeys: string[]) {
  const rows: Doc<"usageDays">[] = [];
  for (const dayKey of dayKeys) {
    const page = await ctx.db
      .query("usageDays")
      .withIndex("by_dayKey", (q) => q.eq("dayKey", dayKey))
      .take(USER_TAKE);
    rows.push(...page);
  }
  return rows;
}

export const heartbeat = mutation({
  args: {
    deltaMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const delta = Math.min(
      HEARTBEAT_MAX_MS,
      Math.max(0, Math.floor(args.deltaMs)),
    );
    if (delta < HEARTBEAT_MIN_MS) {
      return null;
    }
    const now = Date.now();
    const dayKey = utcDayKey(now);
    const existing = await ctx.db
      .query("usageDays")
      .withIndex("by_userId_dayKey", (q) =>
        q.eq("userId", user._id).eq("dayKey", dayKey),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        activeMs: existing.activeMs + delta,
        ticks: existing.ticks + 1,
        lastHeartbeatAt: now,
      });
      return null;
    }
    await ctx.db.insert("usageDays", {
      userId: user._id,
      dayKey,
      activeMs: delta,
      ticks: 1,
      lastHeartbeatAt: now,
    });
    return null;
  },
});

export const dashboard = query({
  args: { now: v.number() },
  returns: v.object({
    kpis: kpiValidator,
    signupWeeks: v.array(weekPointValidator),
    usageDays: v.array(dayPointValidator),
    roles: v.array(rolePointValidator),
    roster: v.array(rosterRowValidator),
  }),
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");
    const now = Number.isFinite(args.now) ? args.now : 0;
    const users = await ctx.db.query("users").take(USER_TAKE);
    const todayStart = utcDayStart(now);
    const weekStart = utcWeekStart(now);
    const monthStart = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      1,
    );
    const mauStart = addUtcDays(todayStart, -29);

    const roleCounts: Record<UserRole, number> = {
      admin: 0,
      premium: 0,
      normal: 0,
    };
    let newThisWeek = 0;
    let newThisMonth = 0;
    for (const user of users) {
      const role = userRole(user);
      roleCounts[role] += 1;
      const created = createdAtMs(user);
      if (created >= weekStart) newThisWeek += 1;
      if (created >= monthStart) newThisMonth += 1;
    }

    const weekStarts: number[] = [];
    for (let i = WEEK_SERIES - 1; i >= 0; i -= 1) {
      weekStarts.push(addUtcDays(weekStart, -i * 7));
    }
    const signupWeeks = weekStarts.map((start) => {
      const end = addUtcDays(start, 7);
      let signups = 0;
      for (const user of users) {
        const created = createdAtMs(user);
        if (created >= start && created < end) signups += 1;
      }
      return { weekStart: start, label: weekLabel(start), signups };
    });

    const dayStarts: number[] = [];
    for (let i = USAGE_LOOKBACK - 1; i >= 0; i -= 1) {
      dayStarts.push(addUtcDays(todayStart, -i));
    }
    const dayKeys = dayStarts.map((start) => utcDayKey(start));
    const usageRows = await loadDays(ctx, dayKeys);

    const byDay = new Map<string, { users: Set<Id<"users">>; ms: number }>();
    for (const key of dayKeys) {
      byDay.set(key, { users: new Set(), ms: 0 });
    }
    const lastSeen = new Map<Id<"users">, number>();
    const weekMs = new Map<Id<"users">, number>();
    const mauUsers = new Set<Id<"users">>();
    const wauUsers = new Set<Id<"users">>();
    const todayMs: number[] = [];
    const todayKey = utcDayKey(todayStart);
    const weekKeys = new Set(
      Array.from({ length: 7 }, (_, i) => utcDayKey(addUtcDays(todayStart, -i))),
    );

    for (const row of usageRows) {
      const bucket = byDay.get(row.dayKey);
      if (bucket) {
        bucket.users.add(row.userId);
        bucket.ms += row.activeMs;
      }
      const prevSeen = lastSeen.get(row.userId);
      if (prevSeen == null || row.lastHeartbeatAt > prevSeen) {
        lastSeen.set(row.userId, row.lastHeartbeatAt);
      }
      const dayStart = utcDayStart(Date.parse(`${row.dayKey}T00:00:00.000Z`));
      if (dayStart >= mauStart) mauUsers.add(row.userId);
      if (weekKeys.has(row.dayKey)) {
        wauUsers.add(row.userId);
        weekMs.set(row.userId, (weekMs.get(row.userId) ?? 0) + row.activeMs);
      }
      if (row.dayKey === todayKey && row.activeMs > 0) {
        todayMs.push(row.activeMs);
      }
    }

    const usageDays = dayStarts.slice(-DAY_SERIES).map((start) => {
      const key = utcDayKey(start);
      const bucket = byDay.get(key) ?? { users: new Set(), ms: 0 };
      return {
        dayKey: key,
        label: shortDayLabel(start),
        activeUsers: bucket.users.size,
        hours: Math.round((bucket.ms / 3_600_000) * 10) / 10,
      };
    });

    const todayBucket = byDay.get(todayKey);
    const rosterSource = [...users].sort(
      (a, b) => createdAtMs(b) - createdAtMs(a),
    );
    const roster = rosterSource.slice(0, ROSTER_TAKE).map((user) => ({
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: userRole(user),
      createdAt: createdAtMs(user),
      lastSeenAt: lastSeen.get(user._id) ?? null,
      weekMs: weekMs.get(user._id) ?? 0,
    }));

    return {
      kpis: {
        totalUsers: users.length,
        newThisWeek,
        newThisMonth,
        dau: todayBucket?.users.size ?? 0,
        wau: wauUsers.size,
        mau: mauUsers.size,
        todayHours: Math.round(((todayBucket?.ms ?? 0) / 3_600_000) * 10) / 10,
        todayMedianMinutes: Math.round(median(todayMs) / 60_000),
      },
      signupWeeks,
      usageDays,
      roles: [
        { role: "normal", count: roleCounts.normal },
        { role: "premium", count: roleCounts.premium },
        { role: "admin", count: roleCounts.admin },
      ],
      roster,
    };
  },
});
