import fuzzysort from "fuzzysort";

export type MerchantClusterProbe = {
  id: string;
  name: string;
  slug: string;
  transactionCount: number;
};

export type SimilarMerchantCluster = {
  members: MerchantClusterProbe[];
};

const FUZZY_THRESHOLD = 0.55;
const MIN_FOLD_CONTAIN = 5;

/** Letters/digits only, lowercased, for twins like McDonald's vs Mcdonalds. */
export function foldMerchantName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parentIndex(parent: number[], index: number): number {
  let cursor = index;
  while (parent[cursor] !== cursor) {
    const next = parent[cursor];
    if (next == null) break;
    parent[cursor] = parent[next] ?? next;
    cursor = parent[cursor] ?? cursor;
  }
  return cursor;
}

function namesLookAlike(
  left: MerchantClusterProbe,
  right: MerchantClusterProbe,
  leftFold: string,
  rightFold: string,
): boolean {
  if (left.id === right.id) return false;
  if (left.slug && right.slug && left.slug === right.slug) return true;
  if (leftFold.length >= 3 && leftFold === rightFold) return true;

  if (
    leftFold.length >= MIN_FOLD_CONTAIN &&
    rightFold.length >= MIN_FOLD_CONTAIN
  ) {
    if (leftFold.includes(rightFold) || rightFold.includes(leftFold)) {
      return true;
    }
  }

  const forward = fuzzysort.single(left.name, right.name);
  const backward = fuzzysort.single(right.name, left.name);
  const score = Math.max(forward?.score ?? 0, backward?.score ?? 0);
  return score >= FUZZY_THRESHOLD;
}

/**
 * Union-find groups of near-duplicate payee names.
 * Singletons are omitted. AI still decides which groups actually merge.
 */
export function clusterSimilarMerchants(
  merchants: MerchantClusterProbe[],
): SimilarMerchantCluster[] {
  const count = merchants.length;
  if (count < 2) return [];

  const parent = merchants.map((_, index) => index);
  const folds = merchants.map((merchant) => foldMerchantName(merchant.name));

  for (let i = 0; i < count; i += 1) {
    const left = merchants[i];
    const leftFold = folds[i];
    if (!left || leftFold == null) continue;
    for (let j = i + 1; j < count; j += 1) {
      const right = merchants[j];
      const rightFold = folds[j];
      if (!right || rightFold == null) continue;
      if (!namesLookAlike(left, right, leftFold, rightFold)) continue;
      const rootI = parentIndex(parent, i);
      const rootJ = parentIndex(parent, j);
      if (rootI !== rootJ) parent[rootJ] = rootI;
    }
  }

  const groups = new Map<number, MerchantClusterProbe[]>();
  for (let i = 0; i < count; i += 1) {
    const merchant = merchants[i];
    if (!merchant) continue;
    const root = parentIndex(parent, i);
    const group = groups.get(root) ?? [];
    group.push(merchant);
    groups.set(root, group);
  }

  return [...groups.values()]
    .filter((members) => members.length >= 2)
    .map((members) => ({
      members: [...members].sort((a, b) => {
        if (b.transactionCount !== a.transactionCount) {
          return b.transactionCount - a.transactionCount;
        }
        return a.name.localeCompare(b.name);
      }),
    }))
    .sort((a, b) => b.members.length - a.members.length);
}
