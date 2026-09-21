import { invalidateConvexUserCache } from "@/shared/convex/cachedRead";
import { api } from "@/shared/convex/httpClient";
import {
  descriptionKey,
  merchantRuleKey,
  type CategoryProfile,
} from "@convex/lib/categorization";
import { cleanMerchantDescriptor } from "@convex/lib/cleanMerchantDescriptor";
import type { ConvexHttpClient } from "convex/browser";
import type { CategorizationSummary } from "../domain/importResult";
import { normalizeUserAiRules } from "../domain/userAiRules";
import {
  labelGroupsWithJev,
  presetTransferProfile,
  shouldUseJevCategorization,
} from "./labelWithJev";

type Row = {
  transactionId: string;
  description: string;
  amount: number;
  updatedAt?: number;
  key: string;
  exactKey?: string;
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

async function persistLearnedRules(
  client: ConvexHttpClient,
  matches: { key: string; profile: CategoryProfile }[],
) {
  for (let i = 0; i < matches.length; i += 100) {
    await client.mutation(api.categorization.rememberRules, {
      rules: matches.slice(i, i + 100),
    });
  }
}

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
  options?: {
    skipCache?: boolean;
    onLabeled?: (item: LabeledTransaction) => void;
  },
): Promise<{ summary: CategorizationSummary; labeled: LabeledTransaction[] }> {
  const summary: CategorizationSummary = {
    ok: true,
    cached: 0,
    ai: 0,
    pending: 0,
  };
  const groups = new Map<string, Row[]>();
  for (const row of input) {
    const key = merchantRuleKey(row.description, row.amount);
    const next = {
      ...row,
      key,
      exactKey: descriptionKey(row.description, row.amount),
    };
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
        const item: LabeledTransaction = {
          transactionId: row.transactionId,
          profile: cleanProfileMerchant(match.profile),
          section: path?.section ?? "",
          category: path?.category ?? "",
          subcategory: path?.subcategory ?? null,
        };
        labeled.push(item);
        summary[source] += 1;
        summary.pending -= 1;
        options?.onLabeled?.(item);
      }
    }
  };

  try {
    const keys = [...groups.keys()];
    const unknown: string[] = [];
    if (options?.skipCache) {
      unknown.push(...keys);
    } else {
      const exactToShop = new Map<string, string>();
      for (const [shopKey, rows] of groups) {
        for (const row of rows) {
          if (row.exactKey) exactToShop.set(row.exactKey, shopKey);
        }
      }
      const lookupKeys = [...new Set([...keys, ...exactToShop.keys()])];
      const shopHits = new Set<string>();
      const exactHits = new Map<string, CategoryProfile>();
      for (let i = 0; i < lookupKeys.length; i += 100) {
        const matches = await client.query(api.categorization.lookup, {
          keys: lookupKeys.slice(i, i + 100),
        });
        for (const match of matches) {
          if (!match.profile || match.profile.tags === undefined) continue;
          if (groups.has(match.key)) {
            shopHits.add(match.key);
            remember([{ key: match.key, profile: match.profile }], "cached");
          } else exactHits.set(match.key, match.profile);
        }
      }
      const seeded: { key: string; profile: CategoryProfile }[] = [];
      for (const key of keys) {
        if (shopHits.has(key)) continue;
        const rows = groups.get(key) ?? [];
        const prior = rows
          .map((row) => (row.exactKey ? exactHits.get(row.exactKey) : undefined))
          .find((profile) => profile != null);
        if (prior) seeded.push({ key, profile: prior });
        else unknown.push(key);
      }
      remember(seeded, "cached");
      await persistLearnedRules(client, seeded);
    }
    if (unknown.length) {
      const stillUnknown: string[] = [];
      const preset: { key: string; profile: CategoryProfile }[] = [];
      for (const key of unknown) {
        const row = groups.get(key)?.[0];
        const profile = row
          ? presetTransferProfile({
              description: row.description,
              paths,
              types: vocabulary.types,
            })
          : null;
        if (profile) preset.push({ key, profile });
        else stillUnknown.push(key);
      }
      remember(preset, "ai");
      await persistLearnedRules(client, preset);
      unknown.length = 0;
      unknown.push(...stillUnknown);
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
        "Jev is not configured. Add a Jev key on Profile, or set JEV_API_KEY.",
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
      onMatch: (match) => remember([match], "ai"),
    });
    await persistLearnedRules(client, jev.matches);
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
