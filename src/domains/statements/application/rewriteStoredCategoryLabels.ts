import { and, eq, inArray, sql } from "drizzle-orm";
import { ensureSeedTaxonomy, upsertTaxonomyNode } from "@/domains/enrichment/application/catalog";
import { toSlug } from "@/domains/enrichment/domain/slug";
import {
  normalizeCategoryLabel,
  singularCategoryKey,
} from "@/domains/statements/application/categoryVocabulary";
import { getDb } from "@/shared/db";
import {
  taxonomyNodes,
  transactionBankCategories,
  transactionLabels,
} from "@/shared/db/schema";

export type RewriteCategoryLabelsResult = {
  detailedUpdated: number;
  taxonomyLabelsUpdated: number;
  nodesRenamed: number;
  merges: Array<{ from: string; to: string }>;
};

type CompoundSplit = {
  from: string;
  left: string;
  right: string;
  rightHint: RegExp;
  leftParentSlug: string;
  rightParentSlug: string;
  facet: "category" | "type";
};

/** Exact label rewrites written into the DB (not display maps). */
const EXACT_RENAMES: Array<{ from: string; to: string }> = [
  { from: "student loan", to: "Student Loans" },
  { from: "student loans", to: "Student Loans" },
  { from: "loan payment", to: "Loan Payment" },
  { from: "loan payments", to: "Loan Payment" },
  { from: "hair salon", to: "Hair Salons" },
  { from: "hair salons", to: "Hair Salons" },
  { from: "hair salons and barbers", to: "Hair Salons" },
  { from: "barber", to: "Barbers" },
  { from: "barbers", to: "Barbers" },
  { from: "online retail", to: "Online Marketplaces" },
  { from: "online marketplaces", to: "Online Marketplaces" },
];

const COMPOUND_SPLITS: CompoundSplit[] = [
  {
    from: "food and drink",
    left: "Food",
    right: "Drink",
    rightHint:
      /coffee|cafe|caf[eé]|drink|beverage|alcohol|bar|pub|tea|juice|smoothie|liquor|wine|beer/i,
    leftParentSlug: "lifestyle",
    rightParentSlug: "lifestyle",
    facet: "category",
  },
  {
    from: "software and subscriptions",
    left: "Software",
    right: "Subscriptions",
    rightHint:
      /subscription|streaming|netflix|spotify|disney|crave|youtube\s*premium|prime\s*video/i,
    leftParentSlug: "lifestyle",
    rightParentSlug: "lifestyle",
    facet: "category",
  },
  {
    from: "rent and housing",
    left: "Rent",
    right: "Housing",
    rightHint:
      /housing|mortgage|property|condo|hoa|home\s*insurance|repairs?|maintenance/i,
    leftParentSlug: "home",
    rightParentSlug: "home",
    facet: "category",
  },
  {
    from: "rideshare and transit",
    left: "Rideshare",
    right: "Transit",
    rightHint:
      /transit|bus|metro|subway|ttc|go\s*train|via\s*rail|parking|fare|pass/i,
    leftParentSlug: "transport",
    rightParentSlug: "transport",
    facet: "category",
  },
  {
    from: "cash and atm",
    left: "Cash",
    right: "ATM",
    rightHint: /\batm\b|bank\s*machine|cash\s*dispenser/i,
    leftParentSlug: "finance",
    rightParentSlug: "finance",
    facet: "category",
  },
  {
    from: "hair salons and barbers",
    left: "Hair Salons",
    right: "Barbers",
    rightHint: /barber/i,
    leftParentSlug: "personal-care",
    rightParentSlug: "personal-care",
    facet: "type",
  },
];

function norm(value: string) {
  return normalizeCategoryLabel(value);
}

function pickCompoundSide(split: CompoundSplit, hint: string | null | undefined) {
  if (hint?.trim() && split.rightHint.test(hint)) return split.right;
  return split.left;
}

async function rewriteCategoryDetailed(): Promise<{
  updated: number;
  merges: Array<{ from: string; to: string }>;
}> {
  const db = getDb();
  const rows = await db
    .select({
      transactionId: transactionBankCategories.transactionId,
      categoryDetailed: transactionBankCategories.categoryDetailed,
    })
    .from(transactionBankCategories);

  const typeByTxn = await loadTypeNamesByTxn(
    rows.map((row) => row.transactionId),
  );

  let updated = 0;
  const merges: Array<{ from: string; to: string }> = [];
  const seenMerge = new Set<string>();

  for (const row of rows) {
    const current = row.categoryDetailed?.trim();
    if (!current) continue;

    let next = current;
    const exact = EXACT_RENAMES.find((rule) => norm(rule.from) === norm(current));
    if (exact) next = exact.to;

    const compound = COMPOUND_SPLITS.find((rule) => norm(rule.from) === norm(next));
    if (compound) {
      next = pickCompoundSide(compound, typeByTxn.get(row.transactionId) ?? next);
    }

    if (next === current) continue;
    await db
      .update(transactionBankCategories)
      .set({ categoryDetailed: next })
      .where(eq(transactionBankCategories.transactionId, row.transactionId));
    updated += 1;
    const key = `${current}=>${next}`;
    if (!seenMerge.has(key)) {
      seenMerge.add(key);
      merges.push({ from: current, to: next });
    }
  }

  return { updated, merges };
}

async function loadTypeNamesByTxn(transactionIds: number[]) {
  const map = new Map<number, string>();
  if (transactionIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      transactionId: transactionLabels.transactionId,
      name: taxonomyNodes.name,
    })
    .from(transactionLabels)
    .innerJoin(taxonomyNodes, eq(taxonomyNodes.id, transactionLabels.nodeId))
    .where(
      and(
        inArray(transactionLabels.transactionId, transactionIds),
        eq(transactionLabels.role, "type"),
      ),
    );
  for (const row of rows) {
    if (row.name) map.set(row.transactionId, row.name);
  }
  return map;
}

async function ensureSplitNodes(split: CompoundSplit) {
  const leftId = await upsertTaxonomyNode({
    facet: split.facet,
    slug: toSlug(split.left),
    name: split.left,
    parentSlug: split.leftParentSlug,
    source: "seed",
  });
  const rightId = await upsertTaxonomyNode({
    facet: split.facet,
    slug: toSlug(split.right),
    name: split.right,
    parentSlug: split.rightParentSlug,
    source: "seed",
  });
  return { leftId, rightId };
}

async function rewriteTaxonomyLabels(): Promise<{
  updated: number;
  nodesRenamed: number;
  merges: Array<{ from: string; to: string }>;
}> {
  const db = getDb();
  await ensureSeedTaxonomy();

  const nodes = await db.select().from(taxonomyNodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byNormName = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const key = `${node.facet}:${norm(node.name)}`;
    const group = byNormName.get(key) ?? [];
    group.push(node);
    byNormName.set(key, group);
  }

  let updated = 0;
  let nodesRenamed = 0;
  const merges: Array<{ from: string; to: string }> = [];
  const seenMerge = new Set<string>();

  // Exact renames on taxonomy node display names + slug when free.
  for (const rule of EXACT_RENAMES) {
    const matches = nodes.filter((node) => norm(node.name) === norm(rule.from));
    for (const node of matches) {
      if (node.name === rule.to) continue;
      const nextSlug = toSlug(rule.to);
      const slugTaken = nodes.some(
        (other) => other.id !== node.id && other.slug === nextSlug,
      );
      await db
        .update(taxonomyNodes)
        .set({
          name: rule.to,
          slug: slugTaken ? node.slug : nextSlug,
          updatedAt: new Date(),
        })
        .where(eq(taxonomyNodes.id, node.id));
      node.name = rule.to;
      if (!slugTaken) node.slug = nextSlug;
      nodesRenamed += 1;
      const key = `${rule.from}=>${rule.to}`;
      if (!seenMerge.has(key)) {
        seenMerge.add(key);
        merges.push({ from: rule.from, to: rule.to });
      }
    }
  }

  // Plural/singular taxonomy twins: point labels at the keeper node.
  const twinGroups = new Map<string, typeof nodes>();
  for (const node of nodes) {
    if (node.facet !== "category" && node.facet !== "type") continue;
    const key = `${node.facet}:${singularCategoryKey(node.name)}`;
    const group = twinGroups.get(key) ?? [];
    group.push(node);
    twinGroups.set(key, group);
  }

  for (const group of twinGroups.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => {
      if (b.name.length !== a.name.length) return b.name.length - a.name.length;
      return a.id - b.id;
    });
    const keeper = ranked[0];
    for (const drop of ranked.slice(1)) {
      const moved = await db
        .update(transactionLabels)
        .set({ nodeId: keeper.id })
        .where(eq(transactionLabels.nodeId, drop.id))
        .returning({ id: transactionLabels.id });
      updated += moved.length;
      const key = `${drop.name}=>${keeper.name}`;
      if (!seenMerge.has(key)) {
        seenMerge.add(key);
        merges.push({ from: drop.name, to: keeper.name });
      }
    }
  }

  // Compound category/type nodes → re-point each label to left/right half.
  const labels = await db
    .select({
      id: transactionLabels.id,
      transactionId: transactionLabels.transactionId,
      role: transactionLabels.role,
      nodeId: transactionLabels.nodeId,
    })
    .from(transactionLabels)
    .where(inArray(transactionLabels.role, ["category", "type"]));

  const typeByTxn = await loadTypeNamesByTxn([
    ...new Set(labels.map((row) => row.transactionId)),
  ]);

  for (const split of COMPOUND_SPLITS) {
    const { leftId, rightId } = await ensureSplitNodes(split);
    const legacyNodes = nodes.filter(
      (node) =>
        node.facet === split.facet && norm(node.name) === norm(split.from),
    );
    if (legacyNodes.length === 0) continue;

    for (const legacy of legacyNodes) {
      const affected = labels.filter((row) => row.nodeId === legacy.id);
      for (const label of affected) {
        const hint =
          typeByTxn.get(label.transactionId) ??
          (await detailedHint(label.transactionId));
        const side = pickCompoundSide(split, hint);
        const nextId = side === split.right ? rightId : leftId;
        if (nextId === label.nodeId) continue;
        await db
          .update(transactionLabels)
          .set({ nodeId: nextId })
          .where(eq(transactionLabels.id, label.id));
        label.nodeId = nextId;
        updated += 1;
      }
      const key = `${legacy.name}=>${split.left}|${split.right}`;
      if (!seenMerge.has(key)) {
        seenMerge.add(key);
        merges.push({ from: legacy.name, to: `${split.left} / ${split.right}` });
      }
    }
  }

  // Refresh node names that still look like compounds after re-point (optional rename leftover).
  void byId;
  void byNormName;
  void sql;

  return { updated, nodesRenamed, merges };
}

async function detailedHint(transactionId: number) {
  const db = getDb();
  const rows = await db
    .select({ categoryDetailed: transactionBankCategories.categoryDetailed })
    .from(transactionBankCategories)
    .where(eq(transactionBankCategories.transactionId, transactionId))
    .limit(1);
  return rows[0]?.categoryDetailed ?? null;
}

/**
 * Rewrite stored categoryDetailed + taxonomy labels in the DB.
 * Analysis/UI should read these values as-is after this runs.
 */
export async function rewriteStoredCategoryLabels(): Promise<RewriteCategoryLabelsResult> {
  const detailed = await rewriteCategoryDetailed();
  const taxonomy = await rewriteTaxonomyLabels();

  const mergeKeys = new Set<string>();
  const merges: Array<{ from: string; to: string }> = [];
  for (const merge of [...detailed.merges, ...taxonomy.merges]) {
    const key = `${merge.from}=>${merge.to}`;
    if (mergeKeys.has(key)) continue;
    mergeKeys.add(key);
    merges.push(merge);
  }

  return {
    detailedUpdated: detailed.updated,
    taxonomyLabelsUpdated: taxonomy.updated,
    nodesRenamed: taxonomy.nodesRenamed,
    merges,
  };
}
