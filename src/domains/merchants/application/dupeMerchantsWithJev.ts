import { askJev, isJevConfigured } from "@/shared/ai/jev.server";
import { cleanMerchantDescriptor } from "@convex/lib/cleanMerchantDescriptor";

const BATCH = 24;

export type DupeCluster = {
  clusterId: number;
  members: Array<{ id: string; name: string }>;
};

function candidatesFor(names: string[]) {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const cleaned = cleanMerchantDescriptor(name) ?? name.trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    found.push(cleaned);
  }
  return found.slice(0, 6);
}

/**
 * Jev decides whether a fuzzy cluster is one payee, and which title to keep.
 * It cannot invent a name outside the candidates.
 */
export async function canonicalMergesWithJev(clusters: DupeCluster[]): Promise<
  Array<{ canonicalName: string; merchantIds: string[] }>
> {
  if (!isJevConfigured() || clusters.length === 0) return [];
  const merges: Array<{ canonicalName: string; merchantIds: string[] }> = [];

  for (let start = 0; start < clusters.length; start += BATCH) {
    const slice = clusters.slice(start, start + BATCH);
    const questions: Record<
      string,
      {
        type: "choice";
        instructions: string;
        criteria: Record<string, string | null>;
      }
    > = {};
    const options = slice.map((cluster) => candidatesFor(cluster.members.map((member) => member.name)));
    slice.forEach((cluster, index) => {
      const names = cluster.members.map((member) => member.name).join("; ");
      questions[`merge_${index}`] = {
        type: "choice",
        instructions: `Cluster ${index} names: ${names}. Are these the same payee, or different ones?`,
        criteria: {
          same: "Same store, brand, or person. A reference number, city, or typo does not make a new payee.",
          distinct:
            "Different payees. Keep Uber and Uber Eats apart. Keep two e-transfer people apart. Keep a transfer to a card apart from a transfer to an account.",
        },
      };
      const choices = options[index] ?? [];
      if (choices.length > 0) {
        const criteria: Record<string, string | null> = {};
        for (const choice of choices) {
          criteria[choice] = "Use this short payee title.";
        }
        questions[`name_${index}`] = {
          type: "choice",
          instructions: `If cluster ${index} is the same payee, which title should the ledger use?`,
          criteria,
        };
      }
    });

    const { answers } = await askJev({
      state: {
        note: "Pick one canonical payee name. Do not merge different people or different transfer destinations.",
      },
      logLabel: "merchant-dupe:jev",
      timeoutMs: 45_000,
      questions,
    });

    slice.forEach((cluster, index) => {
      const merge = answers[`merge_${index}`];
      if (!merge || merge.type !== "choice" || merge.choice !== "same") return;
      const choices = options[index] ?? [];
      const picked = answers[`name_${index}`];
      const canonicalName =
        picked && picked.type === "choice" && choices.includes(picked.choice)
          ? picked.choice
          : choices[0];
      if (!canonicalName) return;
      const ids = [...new Set(cluster.members.map((member) => member.id))];
      if (ids.length < 2) return;
      merges.push({ canonicalName, merchantIds: ids });
    });
  }

  return merges;
}
