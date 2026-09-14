import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/** Current signed-in Convex Auth user profile. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return {
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
    };
  },
});
