import { getAuthUserId } from "@convex-dev/auth/server";
import { Polar } from "@convex-dev/polar";
import { v } from "convex/values";
import { api, components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireUser, userRole } from "./lib/auth";
import { ensureModulesForUser } from "./lib/ensureModules";

/** Polar Premium product (AffinitiAcademy). Override with POLAR_PREMIUM_PRODUCT_ID. */
const PREMIUM_MONTHLY_PRODUCT_ID =
  process.env.POLAR_PREMIUM_PRODUCT_ID ??
  "62d62556-0c5c-40b7-81a3-003382c35bf3";

const POLAR_PRODUCTS: Record<string, string> = {
  premiumMonthly: PREMIUM_MONTHLY_PRODUCT_ID,
};

export const polar = new Polar<DataModel, Record<string, string>>(
  components.polar,
  {
    getUserInfo: async (ctx) => {
      const identity = await ctx.runQuery(api.users.polarIdentity, {});
      return {
        userId: identity.userId,
        email: identity.email,
      };
    },
    products: POLAR_PRODUCTS,
  },
);

export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();

const paidStatuses = new Set(["active", "trialing"]);

function isPaidStatus(status: string): boolean {
  return paidStatuses.has(status);
}

export const applyEntitlement = internalMutation({
  args: {
    metadataUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    status: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await findBillingUser(ctx, args);
    if (!user) {
      console.error("Polar entitlement: no matching user", {
        email: args.email ?? null,
        hasMetadataUserId: Boolean(args.metadataUserId),
      });
      return null;
    }

    const current = userRole(user);
    if (current === "admin") {
      return null;
    }

    const nextRole = isPaidStatus(args.status) ? "premium" : "normal";
    if (current === nextRole) {
      return null;
    }

    await ctx.db.patch(user._id, { role: nextRole });
    const updated = await ctx.db.get(user._id);
    if (updated) {
      await ensureModulesForUser(ctx, updated);
    }
    return null;
  },
});

async function findBillingUser(
  ctx: MutationCtx,
  args: { metadataUserId?: string; email?: string },
) {
  if (args.metadataUserId) {
    const user = await ctx.db.get(args.metadataUserId as Id<"users">);
    if (user) {
      return user;
    }
  }
  const email = args.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }
  return await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .unique();
}

type PolarListedProduct = {
  id: string;
  name: string;
  isArchived: boolean;
  recurringInterval?: string | null;
  prices: Array<{
    isArchived: boolean;
    amountType?: string;
    priceAmount?: number;
    recurringInterval?: string | null;
  }>;
};

function monthlyUsdFromProduct(product: PolarListedProduct | null) {
  if (!product) return null;
  const price =
    product.prices.find(
      (row) =>
        !row.isArchived &&
        row.amountType === "fixed" &&
        row.priceAmount != null,
    ) ??
    product.prices.find((row) => !row.isArchived && row.priceAmount != null);
  if (price?.priceAmount == null) return null;
  const usd = price.priceAmount / 100;
  const interval = price.recurringInterval ?? product.recurringInterval;
  if (interval === "year") return usd / 12;
  return usd;
}

export const polarRevenueReturn = v.object({
  connected: v.boolean(),
  productName: v.union(v.string(), v.null()),
  priceUsd: v.union(v.number(), v.null()),
  subscribers: v.number(),
  mrr: v.number(),
  arr: v.number(),
});

/** Admin snapshot: Polar catalog price × Premium entitlements. */
export async function polarRevenueSnapshot(
  ctx: QueryCtx,
  premiumSubscribers: number,
) {
  const products = (await polar.listProducts(ctx)) as PolarListedProduct[];
  const live = products.filter((row) => !row.isArchived);
  const product =
    live.find((row) => row.id === PREMIUM_MONTHLY_PRODUCT_ID) ??
    live[0] ??
    null;
  const priceUsd = monthlyUsdFromProduct(product);
  const mrr =
    priceUsd == null
      ? 0
      : Math.round(priceUsd * premiumSubscribers * 100) / 100;
  return {
    connected: live.length > 0,
    productName: product?.name ?? null,
    priceUsd,
    subscribers: premiumSubscribers,
    mrr,
    arr: Math.round(mrr * 12 * 100) / 100,
  };
}

const billingReturn = v.object({
  role: v.union(v.literal("admin"), v.literal("normal"), v.literal("premium")),
  status: v.union(v.string(), v.null()),
  productName: v.union(v.string(), v.null()),
  currentPeriodEnd: v.union(v.string(), v.null()),
  premiumProductId: v.string(),
});

export const myBilling = query({
  args: {},
  returns: billingReturn,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const subscription = await polar.getCurrentSubscription(ctx, {
      userId: user._id,
    });
    return {
      role: userRole(user),
      status: subscription?.status ?? null,
      productName: subscription?.product.name ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      premiumProductId: PREMIUM_MONTHLY_PRODUCT_ID,
    };
  },
});

export const syncProducts = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const me = await ctx.runQuery(api.users.me, {});
    if (me?.role !== "admin") {
      throw new Error("Admin access required");
    }
    await polar.syncProducts(ctx);
    return null;
  },
});

export async function applyPolarSubscriptionEvent(
  ctx: ActionCtx,
  event: {
    data: {
      status: string;
      customer?: {
        email?: string | null;
        metadata?: Record<string, string | number | boolean>;
      } | null;
      metadata?: Record<string, string | number | boolean>;
    };
  },
): Promise<void> {
  const customer = event.data.customer;
  const metadataUserId = stringMeta(
    customer?.metadata?.userId ?? event.data.metadata?.userId,
  );
  const email = customer?.email ?? undefined;
  await ctx.runMutation(internal.polar.applyEntitlement, {
    metadataUserId,
    email,
    status: event.data.status,
  });
}

function stringMeta(
  value: string | number | boolean | undefined,
): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}
