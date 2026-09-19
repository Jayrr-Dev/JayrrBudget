import Google from "@auth/core/providers/google";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { ensureModulesForUser } from "./lib/ensureModules";
import { DEFAULT_USER_ROLE, isUserRole } from "./lib/roles";
import { seedStarterTaxonomyForUser } from "./lib/seedStarterTaxonomy";

const passwordResetEmail = Email({
  maxAge: 10 * 60,
  async sendVerificationRequest(...args: any[]) {
    const [{ identifier, token, expires }, ctx] = args;
    await ctx.runAction(internal.email.sendPasswordReset, {
      to: identifier,
      token,
      expires: expires.toISOString(),
    });
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google,
    Password({
      profile(params) {
        const email = String(params.email ?? "")
          .trim()
          .toLowerCase();
        if (!email) {
          throw new ConvexError("Email is required");
        }

        const flow = String(params.flow ?? "");
        if (flow !== "signUp") return { email, name: null };

        const firstName = String(params.firstName ?? "").trim();
        const lastName = String(params.lastName ?? "").trim();
        const name = [firstName, lastName].filter(Boolean).join(" ");

        return { email, name: name || null };
      },
      reset: passwordResetEmail,
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      return await upsertAuthUser(ctx, {
        existingUserId: args.existingUserId ?? null,
        type: args.type,
        profile: args.profile,
      });
    },
  },
});

async function upsertAuthUser(
  ctx: MutationCtx,
  args: {
    existingUserId: Id<"users"> | null;
    type: "oauth" | "credentials" | "email" | "phone" | "verification";
    profile: Record<string, unknown>;
  },
): Promise<Id<"users">> {
  const email =
    typeof args.profile.email === "string"
      ? args.profile.email.trim().toLowerCase()
      : undefined;
  const name =
    typeof args.profile.name === "string" ? args.profile.name : undefined;
  const image =
    typeof args.profile.image === "string" ? args.profile.image : undefined;
  const emailVerified = args.type === "oauth" && Boolean(email);

  let userId = args.existingUserId;
  if (!userId && args.type === "oauth" && email) {
    const linked = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    userId = linked?._id ?? null;
  }
  if (!userId) {
    if (args.type === "credentials") {
      if (email) {
        // Public sign-up must not claim a Google account. Only the signed-in owner can.
        userId = await sessionUserForPasswordLink(ctx, email);
      }
    }
  }

  if (userId) {
    const existing = await ctx.db.get(userId);
    if (existing) {
      await ctx.db.patch(userId, {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(image ? { image } : {}),
        ...(emailVerified
          ? {
              emailVerificationTime:
                existing.emailVerificationTime ?? Date.now(),
            }
          : {}),
        ...(isUserRole(existing.role) ? {} : { role: DEFAULT_USER_ROLE }),
      });
      await seedUserAfterAuth(ctx, userId);
      return userId;
    }
  }

  const createdId = await ctx.db.insert("users", {
    email,
    name,
    image,
    role: DEFAULT_USER_ROLE,
    ...(emailVerified ? { emailVerificationTime: Date.now() } : {}),
  });
  await seedUserAfterAuth(ctx, createdId);
  return createdId;
}

async function sessionUserForPasswordLink(
  ctx: MutationCtx,
  email: string,
): Promise<Id<"users"> | null> {
  const sessionUserId = await getAuthUserId(ctx);
  if (sessionUserId === null) return null;
  const sessionUser = await ctx.db.get(sessionUserId);
  if (!sessionUser) return null;
  const sessionEmail = sessionUser.email?.trim().toLowerCase();
  if (sessionEmail !== email) return null;
  if (sessionUser.emailVerificationTime) return sessionUserId;
  const google = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", sessionUserId).eq("provider", "google"),
    )
    .first();
  if (!google) return null;
  return sessionUserId;
}

async function seedUserAfterAuth(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  await ensureModulesForUser(ctx, user);
  await seedStarterTaxonomyForUser(ctx, user);
}
