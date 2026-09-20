export const FEATURE_FLAG_KEYS = [
  "cloudProcessing",
  "jevCategorization",
  "jevPiggy",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const FEATURE_FLAG_COPY: Record<
  FeatureFlagKey,
  { name: string; description: string }
> = {
  cloudProcessing: {
    name: "Cloud Processing",
    description:
      "Lets us read a statement or loan PDF/photo or chat about your budget. That step leaves this device.",
  },
  jevCategorization: {
    name: "Jev categorization (beta)",
    description:
      "Picks section, then category, then subcategory with TypeSafe Jev from your classification catalog, using each bank line and your Classify Rules.",
  },
  jevPiggy: {
    name: "Typed votes for Jev (beta)",
    description:
      "Lets Jev take typed votes: which board to draw, yes/no checks, and scores. Votes do not write chat or look at images.",
  },
};
