/**
 * Turns the signed-in user's profile + Piggy memory row into system prompt text.
 * Pure: no I/O, safe to unit test.
 */

export type PiggyMemorySnapshot = {
  nickname: string | null;
  basicInfo: string[];
  goals: string[];
  painPoints: string[];
  preferences: string[];
  wins: string[];
  followUps: string[];
  lastSessionSummary: string | null;
  lastSessionAt: number | null;
  lastSessionScope: "ledger" | "canvas" | null;
  sessionCount: number;
};

const MAX_FIRST_NAME_LENGTH = 16;
const EASY_NAME = /^[A-Za-z][a-z'-]{1,15}$/;

/** First whitespace-separated token of the stored `First Last` name. */
export function firstNameFrom(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? first : null;
}

/**
 * "Weird" = hard to say out loud or clearly not a first name:
 * digits, symbols, ALL CAPS handles, very long, or a single letter.
 */
export function isAwkwardFirstName(first: string): boolean {
  if (first.length > MAX_FIRST_NAME_LENGTH) return true;
  return !EASY_NAME.test(first);
}

function bullets(title: string, items: string[]): string[] {
  if (items.length === 0) return [];
  return [`${title}:`, ...items.map((item) => `- ${item}`)];
}

function relativeDays(from: number, now: number): string {
  const days = Math.max(0, Math.round((now - from) / 86_400_000));
  if (days === 0) return "earlier today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** How Piggy should address this person, plus the nickname rule when needed. */
export function buildPiggyNameLines(
  fullName: string | null | undefined,
  nickname: string | null,
): string[] {
  const first = firstNameFrom(fullName);
  if (nickname) {
    return [
      `Call the user "${nickname}" (a nickname you picked earlier). Use it now and then, not every message.`,
    ];
  }
  if (!first) {
    return [
      "You do not know the user's name. Do not guess one. If they share it, save it with remember_about_user as basicInfo.",
    ];
  }
  if (isAwkwardFirstName(first)) {
    return [
      `The user's stored first name is "${first}", which is hard to say. On your first reply, pick one short, friendly, respectful nickname (2-10 letters, no puns on their name), save it with remember_about_user (nickname), and use it from then on. If they object or offer another name, save that instead.`,
    ];
  }
  return [
    `The user's first name is ${first}. Use it naturally, about once per conversation, not every message.`,
  ];
}

/** Memory block appended to the system prompt. Empty array when nothing is known. */
export function buildPiggyMemoryLines(
  memory: PiggyMemorySnapshot,
  now: number,
): string[] {
  const lines: string[] = [];
  lines.push(...bullets("About them", memory.basicInfo));
  lines.push(...bullets("Their goals", memory.goals));
  lines.push(...bullets("Pain points", memory.painPoints));
  lines.push(...bullets("How they like Piggy to talk", memory.preferences));
  lines.push(...bullets("Wins to celebrate", memory.wins));
  lines.push(...bullets("Follow up on", memory.followUps));
  if (memory.lastSessionAt) {
    const when = relativeDays(memory.lastSessionAt, now);
    const where = memory.lastSessionScope ? ` in the ${memory.lastSessionScope} chat` : "";
    lines.push(`Last chat: ${when}${where}. Sessions so far: ${memory.sessionCount}.`);
    if (memory.lastSessionSummary) {
      lines.push(`Last time: ${memory.lastSessionSummary}`);
    }
  }
  if (lines.length === 0) return [];
  return ["WHAT PIGGY REMEMBERS ABOUT THIS USER:", ...lines];
}

/** Rules for when and how Piggy writes to memory. */
export const PIGGY_MEMORY_RULES = [
  "Memory: you have remember_about_user and forget_about_user. Memory is this user's only; it never contains other people.",
  "Save a fact when the user states a goal, a money struggle, a life detail that changes advice (job, family, pay day, currency), a preference about how you talk, or a win. One short line per fact, in plain words.",
  "Do not save transaction rows, balances, or anything already in the ledger data. Do not save secrets like card numbers.",
  "Before ending a longer chat, set lastSessionSummary in one sentence so next time you can pick up where you left off.",
  "If they ask you to forget something, use forget_about_user and confirm in one line.",
].join("\n");
