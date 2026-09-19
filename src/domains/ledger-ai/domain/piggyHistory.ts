import type { UIMessage } from "ai";

export type PiggyHistory = {
  messages: UIMessage[];
  draft: string;
  aliases: [string, string][];
  boardErrors: [string, string][];
};

export const emptyPiggyHistory = (): PiggyHistory => ({ messages: [], draft: "", aliases: [], boardErrors: [] });

/** Interrupted tool inputs must never be replayed or sent as unmatched tool calls. */
export function restorePiggyHistory(value: unknown): PiggyHistory {
  if (!value || typeof value !== "object") return emptyPiggyHistory();
  const record = value as Partial<PiggyHistory>;
  const pairs = (items: unknown): [string, string][] => Array.isArray(items)
    ? items.filter((p): p is [string, string] => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === "string")) : [];
  const messages: UIMessage[] = [];
  for (const message of Array.isArray(record.messages) ? record.messages : []) {
    if (!message || typeof message.id !== "string" || !["user", "assistant"].includes(message.role) || !Array.isArray(message.parts)) continue;
    const parts = message.parts.flatMap((part): UIMessage["parts"] => {
      if (!part || typeof part.type !== "string") return [];
      if (part.type === "text" || part.type === "reasoning") {
        return typeof part.text === "string" ? [{ ...part, state: "done" }] : [];
      }
      if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
        const tool = part as { state?: string; toolCallId?: string };
        return tool.toolCallId && ["output-available", "output-error", "output-denied"].includes(tool.state ?? "") ? [part] : [];
      }
      if (part.type === "source-url") {
        const source = part as { url?: unknown };
        return typeof source.url === "string" ? [part] : [];
      }
      return part.type === "step-start" ? [part] : [];
    });
    if (parts.some((part) => part.type !== "step-start")) messages.push({ ...message, parts });
  }
  return { messages, draft: typeof record.draft === "string" ? record.draft : "", aliases: pairs(record.aliases), boardErrors: pairs(record.boardErrors) };
}

export type PiggyTab = { id: string; name: string };
export type PiggyChatIndex = { tabs: PiggyTab[]; activeId: string };

function migrateTabName(name: string) {
  if (name === "Piggy") return "Jev";
  const match = /^Piggy (\d+)$/.exec(name);
  return match ? `Jev ${match[1]}` : name;
}

export function emptyPiggyChatIndex(): PiggyChatIndex {
  const id = crypto.randomUUID();
  return { tabs: [{ id, name: "Jev" }], activeId: id };
}
export function restorePiggyChatIndex(value: unknown): PiggyChatIndex {
  if (!value || typeof value !== "object") return emptyPiggyChatIndex();
  const record = value as Partial<PiggyChatIndex>;
  const ids = new Set<string>();
  const tabs = (Array.isArray(record.tabs) ? record.tabs : []).filter((tab) => {
    if (!tab || typeof tab.id !== "string" || !tab.id || typeof tab.name !== "string" || ids.has(tab.id)) return false;
    ids.add(tab.id);
    return true;
  }).map((tab) => ({ ...tab, name: migrateTabName(tab.name) })).slice(0, 8);
  if (!tabs.length) return emptyPiggyChatIndex();
  return { tabs, activeId: tabs.some((tab) => tab.id === record.activeId) ? record.activeId! : tabs[0].id };
}
