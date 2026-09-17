export const FEATURE_FLAG_KEYS = [
  "encryptedLedger",
  "cloudProcessing",
  "jevCategorization",
  "jevPiggy",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const FEATURE_FLAG_COPY: Record<
  FeatureFlagKey,
  { name: string; description: string }
> = {
  encryptedLedger: {
    name: "Private ledger",
    description: "Your ledger is encrypted. Only you can read it.",
  },
  cloudProcessing: {
    name: "Cloud Processing",
    description:
      "Lets us read a statement or loan PDF/photo or chat about your budget. That step leaves this device.",
  },
  jevCategorization: {
    name: "Jev categorization (beta)",
    description:
      "Picks categories with TypeSafe Jev instead of the chat model. Faster and cheaper; anything Jev cannot label falls back to the normal model.",
  },
  jevPiggy: {
    name: "Jev for Piggy (beta)",
    description:
      "Lets Piggy ask Jev for typed votes: which board to draw, yes/no checks, and scores. Jev does not write chat or look at images.",
  },
};
