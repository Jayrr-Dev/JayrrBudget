/** Models admins can pick on /service. Ids are catalog keys, not always OpenRouter slugs. */

export type OpenRouterModelChoice = {
  id: string;
  openRouterId: string;
  label: string;
  /** Pin OpenRouter routing, e.g. Cerebras. */
  providerOnly: string | null;
};

export const OPENROUTER_MODEL_CATALOG: readonly OpenRouterModelChoice[] = [
  {
    id: "deepseek/deepseek-v4-flash",
    openRouterId: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    providerOnly: null,
  },
  {
    id: "z-ai/glm-5.3-flash",
    openRouterId: "z-ai/glm-5.3-flash",
    label: "GLM 5.3 Flash",
    providerOnly: null,
  },
  {
    id: "openai/gpt-oss-120b",
    openRouterId: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    providerOnly: null,
  },
  {
    id: "openai/gpt-oss-120b:cerebras",
    openRouterId: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Cerebras)",
    providerOnly: "Cerebras",
  },
  {
    id: "google/gemma-4-31b-it:cerebras",
    openRouterId: "google/gemma-4-31b-it",
    label: "Gemma 4 31B (Cerebras)",
    providerOnly: "Cerebras",
  },
];

const BY_ID = new Map(OPENROUTER_MODEL_CATALOG.map((row) => [row.id, row]));

export function isCatalogModelId(id: string) {
  return BY_ID.has(id);
}

export function resolveOpenRouterModel(id: string): OpenRouterModelChoice {
  const known = BY_ID.get(id);
  if (known) return known;
  return {
    id,
    openRouterId: id,
    label: id,
    providerOnly: null,
  };
}

export function chainFromPrimary(primaryModelId: string): string[] {
  const rest = OPENROUTER_MODEL_CATALOG.map((row) => row.id).filter(
    (id) => id !== primaryModelId,
  );
  return [primaryModelId, ...rest];
}
