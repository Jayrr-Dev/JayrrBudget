import "server-only";

import { emitAiUsage, type AiBilledTo } from "@/shared/ai/aiUsageSink";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * TypeSafe Jev (System One) client. Jev does not write text: it answers typed
 * questions (Choice / Score / Noul) about a `state` with calibrated probabilities.
 * Docs: https://docs.typesafe.ai/api
 */

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-latest";
const JEV_TIMEOUT_MS = 20_000;
/** Jev rejects Choice questions with more options than this. */
export const JEV_MAX_CHOICE_OPTIONS = 255;

export type JevState = string | Record<string, unknown> | unknown[];

export type JevNoulQuestion = { type: "noul"; instructions: string };
export type JevChoiceQuestion = {
  type: "choice";
  instructions: string;
  /** option -> optional description */
  criteria: Record<string, string | null>;
};
export type JevScoreQuestion = {
  type: "score";
  instructions: string;
  /** ordered low -> high */
  criteria: string[];
};
export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;

export type JevNoulAnswer = { type: "noul"; noul: number };
export type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type JevScoreAnswer = {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
};
export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

type AnswerFor<Q extends JevQuestion> = Q extends JevNoulQuestion
  ? JevNoulAnswer
  : Q extends JevChoiceQuestion
    ? JevChoiceAnswer
    : JevScoreAnswer;

export type JevAnswers<Q extends Record<string, JevQuestion>> = {
  [K in keyof Q]: AnswerFor<Q[K]>;
};

type JevResponseBody = {
  model?: string;
  answers?: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type JevKeyContext = { apiKey: string; billedTo: AiBilledTo };

const requestJevKey = new AsyncLocalStorage<JevKeyContext>();

/** User key for this request. Falls through to JEV_API_KEY when unset. */
export function runWithJevKey<T>(context: JevKeyContext, fn: () => T): T {
  return requestJevKey.run(context, fn);
}

function currentJevAuth(): JevKeyContext | null {
  const stored = requestJevKey.getStore();
  if (stored?.apiKey) return stored;
  const apiKey = process.env.JEV_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, billedTo: "platform" };
}

export function isJevConfigured() {
  return currentJevAuth() != null;
}

function assertChoiceSizes(questions: Record<string, JevQuestion>) {
  for (const [name, question] of Object.entries(questions)) {
    if (question.type !== "choice") continue;
    const size = Object.keys(question.criteria).length;
    if (size === 0) throw new Error(`Jev choice "${name}" has no options`);
    if (size > JEV_MAX_CHOICE_OPTIONS) {
      throw new Error(
        `Jev choice "${name}" has ${size} options; max is ${JEV_MAX_CHOICE_OPTIONS}`,
      );
    }
  }
}

/** One Jev call. Every question is answered against the same state. */
export async function askJev<Q extends Record<string, JevQuestion>>(params: {
  state: JevState;
  questions: Q;
  logLabel: string;
  timeoutMs?: number;
}): Promise<{ answers: JevAnswers<Q>; modelId: string; ms: number }> {
  const auth = currentJevAuth();
  if (!auth) throw new Error("JEV_API_KEY is not set");
  assertChoiceSizes(params.questions);

  const started = Date.now();
  let response: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      params.timeoutMs ?? JEV_TIMEOUT_MS,
    );
    try {
      response = await fetch(JEV_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: JEV_MODEL,
          state: params.state,
          questions: params.questions,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`[${params.logLabel}] Jev timed out`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (response.status !== 429 || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  if (!response) throw new Error(`[${params.logLabel}] Jev did not respond`);
  const ms = Date.now() - started;

  if (!response.ok) {
    const text = (await response.text()).slice(0, 300);
    throw new Error(
      `[${params.logLabel}] Jev HTTP ${response.status}: ${text || response.statusText}`,
    );
  }

  const body = (await response.json()) as JevResponseBody;
  const answers = body.answers ?? {};
  for (const [name, question] of Object.entries(params.questions)) {
    const answer = answers[name];
    if (!answer || answer.type !== question.type) {
      throw new Error(
        `[${params.logLabel}] Jev answer missing or mistyped for "${name}"`,
      );
    }
  }

  const modelId = `typesafe/${body.model ?? JEV_MODEL}`;
  const inputTokens = body.usage?.input_tokens;
  const outputTokens = body.usage?.output_tokens;
  await emitAiUsage({
    source: params.logLabel,
    modelId,
    billedTo: auth.billedTo,
    ms,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens:
        inputTokens == null && outputTokens == null
          ? undefined
          : (inputTokens ?? 0) + (outputTokens ?? 0),
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    },
  });

  return { answers: answers as JevAnswers<Q>, modelId, ms };
}
