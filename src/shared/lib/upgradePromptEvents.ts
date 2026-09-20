export const UPGRADE_PROMPT_EVENT = "jayrr-upgrade-prompt";

export function requestUpgradePrompt(detail?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UPGRADE_PROMPT_EVENT, { detail: detail ?? "" }),
  );
}
