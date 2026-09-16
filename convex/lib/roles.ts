/** Account roles for RBAC. */
export const USER_ROLES = ["admin", "normal", "premium"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}

/** Default role for new Password signups. */
export const DEFAULT_USER_ROLE: UserRole = "normal";

/**
 * Which module slugs each role may see / use.
 * Admin includes everything.
 */
const ROLE_MODULES: Record<UserRole, readonly string[]> = {
  normal: [
    "overview",
    "accounts",
    "transactions",
    "merchants",
    "classifications",
    "statements",
    "analysis",
    "issues",
  ],
  premium: [
    "overview",
    "accounts",
    "transactions",
    "merchants",
    "classifications",
    "statements",
    "analysis",
    "canvas",
    "issues",
  ],
  admin: [
    "overview",
    "accounts",
    "transactions",
    "merchants",
    "classifications",
    "statements",
    "analysis",
    "canvas",
    "users",
    "revenue",
    "issues",
    "service",
    "database",
    "modules",
  ],
};

export function roleAllowsModule(role: UserRole, slug: string): boolean {
  return ROLE_MODULES[role].includes(slug);
}

export function modulesForRole(role: UserRole): readonly string[] {
  return ROLE_MODULES[role];
}

/** Rank for “at least this role” checks. */
const ROLE_RANK: Record<UserRole, number> = {
  normal: 1,
  premium: 2,
  admin: 3,
};

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
