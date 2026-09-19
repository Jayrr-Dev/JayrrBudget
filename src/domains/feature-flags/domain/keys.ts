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
    description:
      "Money store is encrypted on this device. Only you can read it. Required for loans, statements, and transactions.",
  },
  cloudProcessing: {
    name: "Cloud Processing",
    description:
      "Lets us read a statement or loan PDF/photo or chat about your budget. That step leaves this device.",
  },
  jevCategorization: {
    name: "Jev categorization (beta)",
    description:
      "Picks section, then category, then subcategory with TypeSafe Jev from your classification catalog, using each bank line's description.",
  },
  jevPiggy: {
    name: "Typed votes for Jev (beta)",
    description:
      "Lets Jev take typed votes: which board to draw, yes/no checks, and scores. Votes do not write chat or look at images.",
  },
};
