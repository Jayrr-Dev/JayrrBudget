import { eq } from "drizzle-orm";
import {
  SEED_TAXONOMY,
  seedNodeSlug,
} from "@/domains/enrichment/domain/seedTaxonomy";
import { toSlug } from "@/domains/enrichment/domain/slug";
import { getDb } from "@/shared/db";
import { entities, taxonomyNodes } from "@/shared/db/schema";

export type EntityCatalogEntry = {
  id: number;
  slug: string;
  displayName: string;
  kind: string;
  parentEntityId: number | null;
};

export type TaxonomyCatalogEntry = {
  id: number;
  facet: string;
  slug: string;
  name: string;
  parentId: number | null;
  path: string;
  depth: number;
};

export type EnrichmentCatalog = {
  entities: EntityCatalogEntry[];
  nodes: TaxonomyCatalogEntry[];
};

export async function ensureSeedTaxonomy() {
  const db = getDb();
  const now = new Date();
  const slugToId = new Map<string, number>();

  const existingRows = await db
    .select({
      id: taxonomyNodes.id,
      slug: taxonomyNodes.slug,
    })
    .from(taxonomyNodes);

  for (const row of existingRows) {
    slugToId.set(row.slug, row.id);
  }

  for (const seed of SEED_TAXONOMY) {
    const slug = seedNodeSlug(seed);
    if (slugToId.has(slug)) continue;

    const parentId = seed.parentSlug
      ? (slugToId.get(seed.parentSlug) ?? null)
      : null;
    const parentPath = seed.parentSlug
      ? await findPath(slugToId, seed.parentSlug)
      : null;
    const path = parentPath ? `${parentPath}/${slug}` : slug;
    const depth = parentPath ? parentPath.split("/").length : 0;

    const [row] = await db
      .insert(taxonomyNodes)
      .values({
        facet: seed.facet,
        slug,
        name: seed.name,
        parentId,
        path,
        depth,
        source: "seed",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (row) {
      slugToId.set(slug, row.id);
    } else {
      const found = await db
        .select()
        .from(taxonomyNodes)
        .where(eq(taxonomyNodes.slug, slug))
        .limit(1);
      if (found[0]) slugToId.set(slug, found[0].id);
    }
  }
}

async function findPath(slugToId: Map<string, number>, parentSlug: string) {
  const db = getDb();
  const id = slugToId.get(parentSlug);
  if (id) {
    const rows = await db
      .select({ path: taxonomyNodes.path })
      .from(taxonomyNodes)
      .where(eq(taxonomyNodes.id, id))
      .limit(1);
    return rows[0]?.path ?? parentSlug;
  }
  const rows = await db
    .select({ path: taxonomyNodes.path })
    .from(taxonomyNodes)
    .where(eq(taxonomyNodes.slug, parentSlug))
    .limit(1);
  return rows[0]?.path ?? parentSlug;
}

export async function loadEnrichmentCatalog(): Promise<EnrichmentCatalog> {
  await ensureSeedTaxonomy();
  const db = getDb();
  const [entityRows, nodeRows] = await Promise.all([
    db
      .select({
        id: entities.id,
        slug: entities.slug,
        displayName: entities.displayName,
        kind: entities.kind,
        parentEntityId: entities.parentEntityId,
      })
      .from(entities),
    db
      .select({
        id: taxonomyNodes.id,
        facet: taxonomyNodes.facet,
        slug: taxonomyNodes.slug,
        name: taxonomyNodes.name,
        parentId: taxonomyNodes.parentId,
        path: taxonomyNodes.path,
        depth: taxonomyNodes.depth,
      })
      .from(taxonomyNodes),
  ]);

  return { entities: entityRows, nodes: nodeRows };
}

export function formatCatalogForPrompt(catalog: EnrichmentCatalog) {
  const entityLines = catalog.entities
    .slice(0, 400)
    .map(
      (e) =>
        `- ${e.slug} | ${e.displayName} | ${e.kind}` +
        (e.parentEntityId ? ` | parentId=${e.parentEntityId}` : ""),
    )
    .join("\n");

  const nodeLines = catalog.nodes
    .slice(0, 500)
    .map((n) => `- ${n.slug} | ${n.name} | facet=${n.facet} | path=${n.path}`)
    .join("\n");

  return [
    "EXISTING ENTITIES (reuse slug when match):",
    entityLines || "(none yet)",
    "",
    "EXISTING TAXONOMY NODES (reuse slug when match):",
    nodeLines || "(none yet)",
  ].join("\n");
}

export async function upsertEntity(params: {
  slug: string;
  displayName: string;
  kind: string;
  parentSlug?: string | null;
  source?: string;
}): Promise<number> {
  const db = getDb();
  const slug = toSlug(params.slug || params.displayName);
  const now = new Date();

  let parentEntityId: number | null = null;
  if (params.parentSlug && toSlug(params.parentSlug) !== slug) {
    parentEntityId = await upsertEntity({
      slug: params.parentSlug,
      displayName: params.parentSlug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      kind: "company",
      source: params.source ?? "ai",
    });
  }

  const existing = await db
    .select()
    .from(entities)
    .where(eq(entities.slug, slug))
    .limit(1);

  if (existing[0]) {
    await db
      .update(entities)
      .set({
        displayName: params.displayName,
        kind: params.kind,
        parentEntityId: parentEntityId ?? existing[0].parentEntityId,
        updatedAt: now,
      })
      .where(eq(entities.id, existing[0].id));
    return existing[0].id;
  }

  const [row] = await db
    .insert(entities)
    .values({
      slug,
      displayName: params.displayName,
      kind: params.kind,
      parentEntityId,
      source: params.source ?? "ai",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row.id;
}

export async function upsertTaxonomyNode(params: {
  facet: string;
  slug: string;
  name: string;
  parentSlug?: string | null;
  source?: string;
}): Promise<number> {
  const db = getDb();
  const slug = toSlug(params.slug || params.name);
  const now = new Date();

  let parentId: number | null = null;
  let parentPath: string | null = null;
  if (params.parentSlug) {
    const parent = await db
      .select()
      .from(taxonomyNodes)
      .where(eq(taxonomyNodes.slug, toSlug(params.parentSlug)))
      .limit(1);
    if (parent[0]) {
      parentId = parent[0].id;
      parentPath = parent[0].path;
    }
  }

  const path = parentPath ? `${parentPath}/${slug}` : slug;
  const depth = parentPath ? parentPath.split("/").length : 0;

  const existing = await db
    .select()
    .from(taxonomyNodes)
    .where(eq(taxonomyNodes.slug, slug))
    .limit(1);

  if (existing[0]) {
    const nextParentId = parentId ?? existing[0].parentId;
    const nextPath = parentId ? path : existing[0].path;
    const nextDepth = parentId ? depth : existing[0].depth;
    if (
      existing[0].name === params.name &&
      existing[0].facet === params.facet &&
      existing[0].parentId === nextParentId &&
      existing[0].path === nextPath &&
      existing[0].depth === nextDepth
    ) {
      return existing[0].id;
    }

    await db
      .update(taxonomyNodes)
      .set({
        name: params.name,
        facet: params.facet,
        parentId: nextParentId,
        path: nextPath,
        depth: nextDepth,
        updatedAt: now,
      })
      .where(eq(taxonomyNodes.id, existing[0].id));
    return existing[0].id;
  }

  const [row] = await db
    .insert(taxonomyNodes)
    .values({
      facet: params.facet,
      slug,
      name: params.name,
      parentId,
      path,
      depth,
      source: params.source ?? "ai",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row.id;
}
