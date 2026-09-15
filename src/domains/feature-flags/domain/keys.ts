export const FEATURE_FLAG_KEYS = ["encryptedLedger", "cloudProcessing"] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const FEATURE_FLAG_COPY: Record<FeatureFlagKey, { name: string; description: string }> = {
  encryptedLedger: {
    name: "Private ledger",
    description: "Your ledger is encrypted. Only you can read it.",
  },
  cloudProcessing: {
    name: "Cloud Processing",
    description: "Lets us read a statement PDF or chat about your budget. That step leaves this device.",
  },
};
