import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { ensureModulesForUser } from "./lib/ensureModules";
import { DEFAULT_USER_ROLE, isUserRole } from "./lib/roles";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
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
        if (!firstName || !lastName) {
          throw new ConvexError("First and last name are required");
        }

        return { email, name: `${firstName} ${lastName}` };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const email =
        typeof args.profile.email === "string"
          ? args.profile.email.trim().toLowerCase()
          : undefined;
      const name =
        typeof args.profile.name === "string" ? args.profile.name : undefined;

      if (args.existingUserId) {
        const existing = await ctx.db.get(args.existingUserId);
        if (existing) {
          await ctx.db.patch(args.existingUserId, {
            ...(email ? { email } : {}),
            ...(name ? { name } : {}),
            ...(isUserRole(existing.role)
              ? {}
              : { role: DEFAULT_USER_ROLE }),
          });
          const user = await ctx.db.get(args.existingUserId);
          if (user) {
            await ensureModulesForUser(ctx, user);
          }
          return args.existingUserId;
        }
      }

      const userId = await ctx.db.insert("users", {
        email,
        name,
        role: DEFAULT_USER_ROLE,
      });
      const user = await ctx.db.get(userId);
      if (user) {
        await ensureModulesForUser(ctx, user);
      }
      return userId;
    },
  },
});
