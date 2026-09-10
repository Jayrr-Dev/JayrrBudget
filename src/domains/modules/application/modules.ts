import { eq } from "drizzle-orm";
import { SEED_MODULES } from "@/domains/modules/domain/types";
import type { AppModuleRecord } from "@/domains/modules/domain/types";
import { getDb } from "@/shared/db";
import { appModules } from "@/shared/db/schema";

export async function ensureAppModules() {
  const db = getDb();
  const existing = await db.select().from(appModules);
  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  const now = new Date();

  for (const seed of SEED_MODULES) {
    const found = bySlug.get(seed.slug);
    if (found) {
      await db
        .update(appModules)
        .set({
          name: seed.name,
          description: seed.description,
          href: seed.href,
          icon: seed.icon,
          category: seed.category,
          sortOrder: seed.sortOrder,
          isCore: seed.isCore,
          updatedAt: now,
        })
        .where(eq(appModules.id, found.id));
      continue;
    }

    await db.insert(appModules).values({
      ...seed,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function listAppModules(options?: {
  enabledOnly?: boolean;
}): Promise<AppModuleRecord[]> {
  await ensureAppModules();
  const db = getDb();
  const rows = await db.select().from(appModules);

  return rows
    .filter((row) => (options?.enabledOnly ? row.enabled : true))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      href: row.href,
      icon: row.icon,
      category: row.category,
      enabled: Boolean(row.enabled),
      sortOrder: row.sortOrder,
      isCore: Boolean(row.isCore),
    }));
}

export async function setModuleEnabled(slug: string, enabled: boolean) {
  await ensureAppModules();
  const db = getDb();
  const rows = await db
    .select()
    .from(appModules)
    .where(eq(appModules.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { ok: false as const, error: "Module not found", status: 404 };
  }
  if (row.isCore && !enabled) {
    return {
      ok: false as const,
      error: "Core modules cannot be disabled",
      status: 400,
    };
  }

  await db
    .update(appModules)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(appModules.id, row.id));

  return { ok: true as const };
}
