export const AI_CAP_EXCEEDED_CODE = "cap_exceeded";

export const AI_CAP_EXCEEDED_MESSAGE =
  "This month's included AI is used up. Add your own OpenRouter key or upgrade.";

export const PREMIUM_REQUIRED_MESSAGE =
  "Premium access required for canvas AI.";

export function isUpgradeOfferText(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("included ai is used up")) return true;
  if (lower.includes("premium access required")) return true;
  if (lower.includes(AI_CAP_EXCEEDED_CODE)) return true;
  return false;
}
