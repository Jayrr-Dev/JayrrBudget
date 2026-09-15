export const FEATURE_FLAG_KEYS = ["encryptedLedger", "cloudProcessing"] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const FEATURE_FLAG_COPY: Record<FeatureFlagKey, { name: string; description: string }> = {
  encryptedLedger: {
    name: "Encrypted ledger (local math)",
    description: "When on, dashboard, analysis, and edits use decrypted vault rows in the browser. Plaintext Convex stays off for those screens.",
  },
  cloudProcessing: {
    name: "Cloud Processing (OCR / canvas AI)",
    description: "Allows statement OCR and canvas AI to send readable financial text to providers. Not end-to-end encrypted.",
  },
};
