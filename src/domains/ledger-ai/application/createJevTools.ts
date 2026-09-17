import "server-only";

import type { CanvasSnapshot } from "@/domains/canvas/domain/canvasContext";
import { CANVAS_SKELETON_KINDS } from "@/domains/canvas/domain/canvasSkeletons";
import {
  askJev,
  isJevConfigured,
  JEV_MAX_CHOICE_OPTIONS,
  type JevQuestion,
} from "@/shared/ai/jev.server";
import { api } from "@convex/_generated/api";
import { tool } from "ai";
import type { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

const LOG_LABEL = "piggy:jev";

const KIND_HINTS: Record<(typeof CANVAS_SKELETON_KINDS)[number], string> = {
  bar_chart: "Where money goes; sort spend descending",
  line_chart: "Trend over months",
  cash_flow: "Income to buckets to destinations",
  steps: "Plan, roadmap, or action list",
  comparison: "Before/after, A vs B, budget vs actual",
  timeline: "Paydays and bill due dates",
  progress: "Goal percent filled",
  flowchart: "How a process works",
  decision: "One yes/no money choice",
  loop: "Payday habit cycle",
  waterfall: "How the balance moved this month",
  split: "Needs / wants / save split",
  accounts: "Peer account snapshot cards",
  table: "Category table of plan vs real",
};

const noulItem = z.object({
  name: z.string().min(1).max(40).describe("Short key, e.g. is_urgent"),
  instructions: z
    .string()
    .min(1)
    .max(400)
    .describe("Yes/no question Jev answers with a probability."),
});

const choiceItem = z.object({
  name: z.string().min(1).max(40),
  instructions: z.string().min(1).max(400),
  options: z
    .array(z.string().min(1).max(80))
    .min(2)
    .max(32)
    .describe("Closed list. Jev picks one."),
});

const scoreItem = z.object({
  name: z.string().min(1).max(40),
  instructions: z.string().min(1).max(400),
  levels: z
    .array(z.string().min(1).max(80))
    .min(2)
    .max(8)
    .describe("Ordered low to high, e.g. calm, caution, urgent."),
});

function criteriaFromOptions(options: string[]) {
  const criteria: Record<string, string | null> = {};
  for (const option of options.slice(0, JEV_MAX_CHOICE_OPTIONS)) {
    criteria[option] = null;
  }
  return criteria;
}

function buildQuestions(input: {
  nouls?: Array<{ name: string; instructions: string }>;
  choices?: Array<{ name: string; instructions: string; options: string[] }>;
  scores?: Array<{ name: string; instructions: string; levels: string[] }>;
}) {
  const questions: Record<string, JevQuestion> = {};
  for (const row of input.nouls ?? []) {
    questions[row.name] = { type: "noul", instructions: row.instructions };
  }
  for (const row of input.choices ?? []) {
    questions[row.name] = {
      type: "choice",
      instructions: row.instructions,
      criteria: criteriaFromOptions(row.options),
    };
  }
  for (const row of input.scores ?? []) {
    questions[row.name] = {
      type: "score",
      instructions: row.instructions,
      criteria: row.levels,
    };
  }
  return questions;
}

function compactCanvas(canvas: CanvasSnapshot | null) {
  if (!canvas) {
    return { empty: true, shapeCount: 0, labels: [] as string[] };
  }
  const labels = canvas.shapes
    .map((shape) => shape.text?.trim() || shape.name?.trim() || "")
    .filter(Boolean)
    .slice(0, 24);
  return {
    empty: canvas.shapeCount === 0,
    shapeCount: canvas.shapeCount,
    labels,
  };
}

/** Feature flag + env key. Off while loading is the caller's problem. */
export async function piggyMayUseJev(client: ConvexHttpClient) {
  if (!isJevConfigured()) return false;
  const flag = await client.query(api.featureFlags.get, { key: "jevPiggy" });
  return flag.enabled;
}

export function createJevTools() {
  return {
    ask_jev: tool({
      description:
        "Ask TypeSafe Jev for typed votes, not chat. Use for classify / yes-no / score on facts you already have (user ask, budget numbers, board notes). Jev cannot write sentences, invent numbers, or see images. You still talk and draw. Call this when a branch is fuzzy: treat vs bill, which layout, ping vs not, how urgent.",
      inputSchema: z.object({
        about: z
          .string()
          .min(1)
          .max(4000)
          .describe("Facts to judge. Plain data, not instructions to Jev."),
        nouls: z.array(noulItem).max(12).optional(),
        choices: z.array(choiceItem).max(6).optional(),
        scores: z.array(scoreItem).max(4).optional(),
      }),
      execute: async (input) => {
        const questions = buildQuestions(input);
        if (Object.keys(questions).length === 0) {
          return {
            ok: false as const,
            error: "Ask at least one noul, choice, or score.",
          };
        }
        try {
          const { answers, modelId, ms } = await askJev({
            state: { about: input.about },
            questions,
            logLabel: LOG_LABEL,
          });
          return { ok: true as const, modelId, ms, answers };
        } catch (error) {
          return {
            ok: false as const,
            error: error instanceof Error ? error.message : "Jev failed",
          };
        }
      },
    }),
  };
}

/** Canvas-only: pick a skeleton before stamping. */
export function createCanvasJevTools(canvas: CanvasSnapshot | null) {
  const kindCriteria: Record<string, string | null> = {};
  for (const kind of CANVAS_SKELETON_KINDS) {
    kindCriteria[kind] = KIND_HINTS[kind];
  }

  return {
    ...createJevTools(),
    plan_board_with_jev: tool({
      description:
        "Ask Jev which canvas skeleton to stamp and whether to draw now. Call before use_skeleton when the layout is not obvious. Then stamp that kind (or talk only if should_draw is low).",
      inputSchema: z.object({
        userAsk: z
          .string()
          .min(1)
          .max(2000)
          .describe("What the user asked to see or decide."),
      }),
      execute: async ({ userAsk }) => {
        try {
          const { answers, modelId, ms } = await askJev({
            state: {
              userAsk,
              board: compactCanvas(canvas),
            },
            questions: {
              kind: {
                type: "choice",
                instructions:
                  "Which board layout best shows this money question? Pick one skeleton. Prefer bar_chart for spend mix, comparison for vs, progress for a goal, split for 50/30/20, decision for one yes/no.",
                criteria: kindCriteria,
              },
              should_draw: {
                type: "noul",
                instructions:
                  "Should Piggy draw a board now, rather than only reply in chat?",
              },
              highlight_risk: {
                type: "noul",
                instructions:
                  "Does this request center overspend, debt, a shortfall, or a risky choice?",
              },
              density: {
                type: "score",
                instructions: "How many data points belong on this board?",
                criteria: [
                  "Few: about 3 items",
                  "Typical: about 5 items",
                  "Dense: about 8 items",
                ],
              },
            },
            logLabel: LOG_LABEL,
          });
          const slots =
            answers.density.score < 0.75
              ? 3
              : answers.density.score < 1.5
                ? 5
                : 8;
          return {
            ok: true as const,
            modelId,
            ms,
            kind: answers.kind.choice,
            kindConfidence: answers.kind.confidence,
            kindProbabilities: answers.kind.probabilities,
            shouldDraw: answers.should_draw.noul,
            highlightRisk: answers.highlight_risk.noul,
            slots,
          };
        } catch (error) {
          return {
            ok: false as const,
            error: error instanceof Error ? error.message : "Jev failed",
          };
        }
      },
    }),
  };
}
