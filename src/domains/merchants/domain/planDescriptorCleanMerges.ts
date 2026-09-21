import { cleanMerchantDescriptor } from "@convex/lib/cleanMerchantDescriptor";

export type DescriptorCleanMerge = {
  canonicalName: string;
  merchantIds: string[];
};

type NamedMerchant = {
  id: string;
  name: string;
};

/**
 * POS Debit / Interac / Visa Debit prefixes are statement rails, not payees.
 * Group each stripped name with an existing merchant of that name when present.
 */
export function planDescriptorCleanMerges(
  listed: NamedMerchant[],
): DescriptorCleanMerge[] {
  const byId = new Map(listed.map((merchant) => [merchant.id, merchant]));
  const groups = new Map<string, { canonicalName: string; ids: Set<string> }>();

  for (const merchant of listed) {
    const canonical = cleanMerchantDescriptor(merchant.name);
    if (!canonical) {
      // "( )" has no payee left. Clear it instead of keeping the punctuation.
      if (!/[a-z0-9]/i.test(merchant.name)) {
        const existing = groups.get("");
        if (existing) {
          existing.ids.add(merchant.id);
          continue;
        }
        groups.set("", {
          canonicalName: "",
          ids: new Set([merchant.id]),
        });
      }
      continue;
    }
    if (canonical.toLowerCase() === merchant.name.trim().toLowerCase())
      continue;
    const key = canonical.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.ids.add(merchant.id);
      continue;
    }
    groups.set(key, { canonicalName: canonical, ids: new Set([merchant.id]) });
  }

  for (const merchant of listed) {
    const group = groups.get(merchant.name.trim().toLowerCase());
    if (group) group.ids.add(merchant.id);
  }

  return [...groups.values()].map((group) => ({
    canonicalName: group.canonicalName,
    merchantIds: [...group.ids].filter((id) => byId.has(id)),
  }));
}
