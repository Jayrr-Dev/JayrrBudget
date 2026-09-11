import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { upsertEntity } from "@/domains/enrichment/application/catalog";
import {
  resolveCompanyAlias,
  resolveCompanyFromRules,
  SKIP_COMPANY_FALLBACK,
  type CompanyRef,
} from "@/domains/enrichment/domain/companyRules";
import { toSlug } from "@/domains/enrichment/domain/slug";
import { getDb } from "@/shared/db";
import {
  entities,
  transactionEnrichment,
  transactionEntities,
  transactions,
} from "@/shared/db/schema";

export type ApplyCompanyEntitiesResult = {
  scanned: number;
  matched: number;
  companiesCreated: number;
  linksCreated: number;
  linksUpdated: number;
  skippedUnchanged: number;
};

function merchantBlob(row: {
  merchantClean: string | null;
  description: string;
}) {
  return [row.merchantClean, row.description].filter(Boolean).join(" ");
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadEntityIndexes() {
  const db = getDb();
  const rows = await db
    .select({
      id: entities.id,
      slug: entities.slug,
      displayName: entities.displayName,
      kind: entities.kind,
    })
    .from(entities);

  const bySlug = new Map<string, (typeof rows)[number]>();
  const byName = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    bySlug.set(row.slug, row);
    byName.set(row.displayName.trim().toLowerCase(), row);
  }

  return { bySlug, byName, knownSlugs: new Set(bySlug.keys()) };
}

function resolveFromCatalog(
  merchantClean: string | null,
  indexes: Awaited<ReturnType<typeof loadEntityIndexes>>,
): CompanyRef | null {
  if (!merchantClean?.trim()) return null;
  const raw = merchantClean.trim();
  const key = raw.toLowerCase();
  if (SKIP_COMPANY_FALLBACK.has(key)) return null;

  const slug = toSlug(raw);
  const bySlug = indexes.bySlug.get(slug);
  if (bySlug && (bySlug.kind === "company" || bySlug.kind === "brand")) {
    // Prefer parent company when brand is linked elsewhere; still OK to use brand
    // as company role if that is what catalog has as the spend face.
    if (bySlug.kind === "company") {
      return { slug: bySlug.slug, displayName: bySlug.displayName };
    }
  }

  const byName = indexes.byName.get(key);
  if (byName?.kind === "company") {
    return { slug: byName.slug, displayName: byName.displayName };
  }

  // Prefer company-kind slug match over brand when both exist.
  if (bySlug?.kind === "brand") {
    const companyish = indexes.bySlug.get(bySlug.slug.replace(/-brand$/, ""));
    if (companyish?.kind === "company") {
      return {
        slug: companyish.slug,
        displayName: companyish.displayName,
      };
    }
    return { slug: bySlug.slug, displayName: bySlug.displayName };
  }

  // Create from merchantClean when it looks like a real merchant label.
  if (slug.length < 2) return null;
  if (/^\d+$/.test(slug)) return null;

  return {
    slug,
    displayName: raw,
  };
}

function resolveCompany(
  row: {
    merchantClean: string | null;
    description: string;
  },
  indexes: Awaited<ReturnType<typeof loadEntityIndexes>>,
): CompanyRef | null {
  const aliasHit = resolveCompanyAlias(row.merchantClean);
  if (aliasHit) return aliasHit;

  const blob = merchantBlob(row);
  const fromRules = resolveCompanyFromRules(blob);
  if (fromRules) return fromRules;

  return resolveFromCatalog(row.merchantClean, indexes);
}

async function attachCompanyLink(params: {
  transactionId: number;
  entityId: number;
  existingEntityId: number | null;
}): Promise<"created" | "updated" | "unchanged"> {
  const db = getDb();
  const { transactionId, entityId, existingEntityId } = params;

  if (existingEntityId === entityId) return "unchanged";

  if (existingEntityId != null) {
    await db
      .update(transactionEntities)
      .set({
        entityId,
        confidence: "HIGH",
        source: "rules",
      })
      .where(
        and(
          eq(transactionEntities.transactionId, transactionId),
          eq(transactionEntities.role, "company"),
        ),
      );
    return "updated";
  }

  await db.insert(transactionEntities).values({
    transactionId,
    entityId,
    role: "company",
    confidence: "HIGH",
    source: "rules",
    createdAt: new Date(),
  });
  return "created";
}

/**
 * Deterministic pass: merchantClean (+ description) → company entity link.
 * Upserts entities and writes/updates transaction_entities role=company.
 */
export async function applyCompanyEntities(): Promise<ApplyCompanyEntitiesResult> {
  const db = getDb();
  const indexes = await loadEntityIndexes();
  const companyLink = alias(transactionEntities, "company_link");

  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      merchantClean: transactionEnrichment.merchantClean,
      companyEntityId: companyLink.entityId,
    })
    .from(transactions)
    .leftJoin(
      transactionEnrichment,
      eq(transactionEnrichment.transactionId, transactions.id),
    )
    .leftJoin(
      companyLink,
      and(
        eq(companyLink.transactionId, transactions.id),
        eq(companyLink.role, "company"),
      ),
    );

  let matched = 0;
  let companiesCreated = 0;
  let linksCreated = 0;
  let linksUpdated = 0;
  let skippedUnchanged = 0;

  const entityIdCache = new Map<string, number>();

  for (const row of rows) {
    const company = resolveCompany(row, indexes);
    if (!company) continue;
    matched += 1;

    let entityId = entityIdCache.get(company.slug);
    if (entityId == null) {
      const existed = indexes.knownSlugs.has(company.slug);
      entityId = await upsertEntity({
        slug: company.slug,
        displayName: company.displayName || titleFromSlug(company.slug),
        kind: "company",
        source: "rules",
      });
      entityIdCache.set(company.slug, entityId);
      indexes.knownSlugs.add(company.slug);
      indexes.bySlug.set(company.slug, {
        id: entityId,
        slug: company.slug,
        displayName: company.displayName,
        kind: "company",
      });
      if (!existed) companiesCreated += 1;
    }

    const outcome = await attachCompanyLink({
      transactionId: row.id,
      entityId,
      existingEntityId: row.companyEntityId ?? null,
    });

    if (outcome === "created") linksCreated += 1;
    else if (outcome === "updated") linksUpdated += 1;
    else skippedUnchanged += 1;
  }

  // Normalize common display names that AI left lowercase/odd.
  await db
    .update(entities)
    .set({ displayName: "CIBC", updatedAt: new Date() })
    .where(
      and(eq(entities.slug, "cibc"), inArray(entities.displayName, ["Cibc", "cibc"])),
    );
  await db
    .update(entities)
    .set({ displayName: "OpenAI", updatedAt: new Date() })
    .where(
      and(
        eq(entities.slug, "openai"),
        inArray(entities.displayName, ["Openai", "openai", "Openai"]),
      ),
    );
  await db
    .update(entities)
    .set({ displayName: "X", updatedAt: new Date() })
    .where(
      and(
        eq(entities.slug, "x-corp"),
        inArray(entities.displayName, ["X Corp", "x corp", "X corp"]),
      ),
    );

  return {
    scanned: rows.length,
    matched,
    companiesCreated,
    linksCreated,
    linksUpdated,
    skippedUnchanged,
  };
}
