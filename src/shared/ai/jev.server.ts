import "server-only";

import { emitAiUsage } from "@/shared/ai/aiUsageSink";

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

export function isJevConfigured() {
  return Boolean(process.env.JEV_API_KEY?.trim());
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
  const apiKey = process.env.JEV_API_KEY?.trim();
  if (!apiKey) throw new Error("JEV_API_KEY is not set");
  assertChoiceSizes(params.questions);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? JEV_TIMEOUT_MS,
  );
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    billedTo: "platform",
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
