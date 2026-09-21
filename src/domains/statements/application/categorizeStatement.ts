import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import {
  descriptionKey,
  type CategoryProfile,
} from "@convex/lib/categorization";
import { cleanMerchantDescriptor } from "@convex/lib/cleanMerchantDescriptor";
import type { ConvexHttpClient } from "convex/browser";
import type { CategorizationSummary } from "../domain/importResult";
import { normalizeUserAiRules } from "../domain/userAiRules";
import { labelGroupsWithJev, shouldUseJevCategorization } from "./labelWithJev";

type Row = {
  transactionId: string;
  description: string;
  amount: number;
  updatedAt?: number;
  key: string;
};

export type LabeledTransaction = {
  transactionId: string;
  profile: CategoryProfile;
  section: string;
  category: string;
  subcategory: string | null;
};

type Path = {
  key: string;
  section: string;
  category: string;
  subcategory: string | null;
};

function cleanProfileMerchant(profile: CategoryProfile): CategoryProfile {
  return {
    ...profile,
    merchant:
      cleanMerchantDescriptor(profile.merchant) ?? profile.merchant.trim(),
  };
}

/** Label description groups. Does not write the ledger. */
export async function labelDescriptionGroups(
  client: ConvexHttpClient,
  input: Array<{ transactionId: string; description: string; amount: number }>,
  options?: { skipCache?: boolean },
): Promise<{ summary: CategorizationSummary; labeled: LabeledTransaction[] }> {
  const summary: CategorizationSummary = {
    ok: true,
    cached: 0,
    ai: 0,
    pending: 0,
  };
  const groups = new Map<string, Row[]>();
  for (const row of input) {
    const key = descriptionKey(row.description, row.amount);
    const next = { ...row, key };
    const group = groups.get(key);
    if (group) group.push(next);
    else groups.set(key, [next]);
  }

  const labeled: LabeledTransaction[] = [];
  if (!groups.size) return { summary, labeled };
  summary.pending = input.length;

  await client.mutation(api.categorization.publishOwnVocabulary, {});
  const vocabulary: {
    paths: Path[];
    spreads: string[];
    types: string[];
    tags: string[];
  } = await client.query(api.categorization.vocabulary, {});
  const paths = vocabulary.paths;
  const tagCatalog = vocabulary.tags;

  const remember = (
    matches: { key: string; profile: CategoryProfile }[],
    source: "cached" | "ai",
  ) => {
    for (const match of matches) {
      const rows = groups.get(match.key);
      if (!rows) continue;
      const path = paths.find((item) => item.key === match.profile.pathKey);
      for (const row of rows) {
        labeled.push({
          transactionId: row.transactionId,
          profile: cleanProfileMerchant(match.profile),
          section: path?.section ?? "",
          category: path?.category ?? "",
          subcategory: path?.subcategory ?? null,
        });
        summary[source] += 1;
        summary.pending -= 1;
      }
    }
  };

  try {
    const keys = [...groups.keys()];
    const unknown: string[] = [];
    if (options?.skipCache) {
      unknown.push(...keys);
    } else {
      for (let i = 0; i < keys.length; i += 100) {
        const matches = await client.query(api.categorization.lookup, {
          keys: keys.slice(i, i + 100),
        });
        const cached: { key: string; profile: CategoryProfile }[] = [];
        for (const match of matches) {
          if (match.profile && match.profile.tags !== undefined) {
            cached.push({ key: match.key, profile: match.profile });
          } else unknown.push(match.key);
        }
        remember(cached, "cached");
      }
    }
    if (!unknown.length) {
      return { summary: { ...summary, ok: summary.pending === 0 }, labeled };
    }

    if (!paths.length) {
      throw new Error(
        "Category vocabulary is empty. Add categories before categorizing.",
      );
    }
    if (!shouldUseJevCategorization()) {
      throw new Error(
        "Jev is not configured. Set JEV_API_KEY to classify transactions.",
      );
    }
    const aiRules = await client.query(api.aiRules.get, {});
    const deadline = Date.now() + 240_000;
    const catalog = await client.query(api.classifications.list, {});
    const jev = await labelGroupsWithJev({
      groups: unknown.map((key) => ({
        key,
        description: groups.get(key)![0].description,
        amount: groups.get(key)![0].amount,
      })),
      paths,
      catalog,
      spreads: vocabulary.spreads,
      types: vocabulary.types,
      tags: tagCatalog,
      ownerRules: normalizeUserAiRules(aiRules.rules ?? []),
      deadline,
    });
    remember(jev.matches, "ai");
    if (jev.error) {
      summary.error = jev.error;
      console.warn(
        `[categorization] jev left ${jev.failed.length} group(s): ${jev.error}`,
      );
    }
  } catch (error) {
    summary.error =
      error instanceof Error ? error.message : "Categorization failed";
  }

  return {
    summary: { ...summary, ok: summary.pending === 0 && !summary.error },
    labeled,
  };
}

export async function categorizeStatement(
  client: ConvexHttpClient,
  uploadId: number,
  options?: { force?: boolean },
): Promise<CategorizationSummary> {
  const force = options?.force === true;
  const groups = new Map<string, Row[]>();
  let cursor: string | null = null;
  do {
    const result: { page: Row[]; isDone: boolean; continueCursor: string } =
      await client.query(api.categorization.pendingPage, {
        uploadId,
        paginationOpts: { cursor, numItems: 200 },
        includeAll: force ? true : undefined,
      });
    for (const row of result.page) {
      const group = groups.get(row.key);
      if (group) group.push(row);
      else groups.set(row.key, [row]);
    }
    if (result.isDone) break;
    cursor = result.continueCursor;
  } while (cursor);

  const pending = [...groups.values()].flat();
  const { summary, labeled } = await labelDescriptionGroups(client, pending, {
    skipCache: force,
  });
  if (!labeled.length) {
    await invalidateConvexUserCache();
    return summary;
  }

  const byKey = new Map<
    string,
    {
      profile: CategoryProfile;
      rows: { transactionId: string; updatedAt: number }[];
    }
  >();
  for (const item of labeled) {
    const row = pending.find(
      (entry) => entry.transactionId === item.transactionId,
    );
    if (!row || row.updatedAt == null) continue;
    const key = row.key;
    const group = byKey.get(key);
    const next = { transactionId: row.transactionId, updatedAt: row.updatedAt };
    if (group) group.rows.push(next);
    else byKey.set(key, { profile: item.profile, rows: [next] });
  }

  const batches = [...byKey.entries()].map(([key, group]) => ({
    key,
    profile: group.profile,
    rows: group.rows,
  }));
  for (let i = 0; i < batches.length; i += 40) {
    const slice = batches.slice(i, i + 40);
    let rows = 0;
    let chunk: typeof slice = [];
    for (const group of slice) {
      if (rows + group.rows.length > 200) {
        await client.mutation(api.categorization.apply, {
          groups: chunk,
          overwrite: force ? true : undefined,
        });
        chunk = [];
        rows = 0;
      }
      chunk.push(group);
      rows += group.rows.length;
    }
    if (chunk.length) {
      await client.mutation(api.categorization.apply, {
        groups: chunk,
        overwrite: force ? true : undefined,
      });
    }
  }
  await invalidateConvexUserCache();
  return summary;
}
