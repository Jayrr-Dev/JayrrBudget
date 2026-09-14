import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MODULE_CATALOG } from "./moduleCatalog";
import {
  DEFAULT_USER_ROLE,
  isUserRole,
  modulesForRole,
  type UserRole,
} from "./roles";

type EnsureDb = Pick<MutationCtx, "db">;

function roleForUser(user: Doc<"users">): UserRole {
  return isUserRole(user.role) ? user.role : DEFAULT_USER_ROLE;
}

/**
 * Upsert enabled module rows for a user from their role (`modulesForRole`).
 * Catalog metadata comes from MODULE_CATALOG; which slugs apply is never hardcoded here.
 */
export async function ensureModulesForUser(
  ctx: EnsureDb,
  user: Doc<"users">,
): Promise<{ inserted: number; updated: number }> {
  const allowed = new Set(modulesForRole(roleForUser(user)));
  const existing = await ctx.db
    .query("appModules")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .collect();
  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  const now = Date.now();
  let nextLegacy =
    existing.reduce((max, row) => Math.max(max, row.legacyId), 0) + 1;
  let inserted = 0;
  let updated = 0;

  for (const seed of MODULE_CATALOG) {
    if (!allowed.has(seed.slug)) continue;

    const found = bySlug.get(seed.slug);
    if (found) {
      await ctx.db.patch(found._id, {
        name: seed.name,
        description: seed.description,
        href: seed.href,
        icon: seed.icon,
        category: seed.category,
        sortOrder: seed.sortOrder,
        isCore: seed.isCore,
        // Role-allowed modules stay available; admin may still disable non-core later.
        enabled: found.isCore ? true : found.enabled,
        updatedAt: now,
      });
      updated += 1;
      continue;
    }

    await ctx.db.insert("appModules", {
      userId: user._id,
      legacyId: nextLegacy++,
      slug: seed.slug,
      name: seed.name,
      description: seed.description,
      href: seed.href,
      icon: seed.icon,
      category: seed.category,
      enabled: true,
      sortOrder: seed.sortOrder,
      isCore: seed.isCore,
      createdAt: now,
      updatedAt: now,
    });
    inserted += 1;
  }

  return { inserted, updated };
}
