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

const RETIRED =
  "Retired: flat transactions schema. Re-import CSV via scripts/rebuild-flat-transactions.ts";

/** No-op - flat schema has no taxonomy_nodes table. */
export async function ensureSeedTaxonomy() {}

export async function loadEnrichmentCatalog(): Promise<EnrichmentCatalog> {
  return { entities: [], nodes: [] };
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

export async function upsertEntity(_params: {
  slug: string;
  displayName: string;
  kind: string;
  parentSlug?: string | null;
  source?: string;
}): Promise<number> {
  throw new Error(RETIRED);
}

export async function upsertTaxonomyNode(_params: {
  facet: string;
  slug: string;
  name: string;
  parentSlug?: string | null;
  source?: string;
}): Promise<number> {
  throw new Error(RETIRED);
}
