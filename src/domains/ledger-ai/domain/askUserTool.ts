import { tool, type InferUITool } from "ai";
import { z } from "zod";

/**
 * Client-side tool: Piggy pauses and asks the user structured questions.
 * No `execute`; the chat UI renders a questionnaire and posts the answers
 * back with `addToolResult`, then the model resumes.
 */
export const ASK_USER_TOOL_NAME = "ask_user";

export const MAX_ASK_USER_QUESTIONS = 4;
export const MAX_ASK_USER_CHOICES = 6;

const askUserChoiceSchema = z.object({
  value: z.string().min(1).describe("Stable value returned in the answer"),
  label: z.string().min(1),
  description: z.string().optional(),
});

const askUserQuestionSchema = z.object({
  id: z.string().min(1).describe("Short key, e.g. 'category'"),
  prompt: z.string().min(1),
  description: z.string().optional(),
  choices: z.array(askUserChoiceSchema).min(1).max(MAX_ASK_USER_CHOICES),
  multiple: z.boolean().optional().describe("Allow more than one choice"),
  required: z
    .boolean()
    .optional()
    .describe("Default true. false lets the user skip this question"),
  allowOther: z
    .boolean()
    .optional()
    .describe(
      "Default true: a free-text field is shown so the user can type an answer not in choices. Set false only for strict yes/no questions.",
    ),
});

export const askUserInputSchema = z.object({
  title: z.string().optional().describe("Short heading, e.g. 'Quick check'"),
  questions: z.array(askUserQuestionSchema).min(1).max(MAX_ASK_USER_QUESTIONS),
});

const askUserAnswerSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  values: z.array(z.string()).describe("Chosen choice values"),
  labels: z.array(z.string()).describe("Chosen choice labels"),
  other: z.string().optional().describe("Free-text answer, if given"),
  skipped: z.boolean(),
});

export const askUserOutputSchema = z.object({
  answers: z.array(askUserAnswerSchema),
  /** True when the user dismissed the form without answering. */
  dismissed: z.boolean(),
});

export type AskUserInput = z.infer<typeof askUserInputSchema>;
export type AskUserQuestion = AskUserInput["questions"][number];
export type AskUserOutput = z.infer<typeof askUserOutputSchema>;
export type AskUserAnswer = AskUserOutput["answers"][number];

export const askUserTool = tool({
  description: [
    "Ask the signed-in user one to four short multiple-choice questions and wait for their answers.",
    "Use it when a request is genuinely ambiguous (which account, which of several different matching rows, a category that could sit in two sections), or when you need a yes/no before a risky edit such as delete.",
    "Do not use it to pick a subcategory that is already the obvious fit, or to ask which of the rows the user already listed they meant. Decide, act, then state the assumption.",
    "Keep prompts short. Give 2 to 6 concrete choices per question. A free-text field is shown by default; set allowOther false only for strict yes/no. If the answer comes back in `other`, treat it as the user's pick (a taxonomy name, or a new one to create).",
    "Do not use it for questions you can answer yourself with search_transactions or list_taxonomy.",
  ].join(" "),
  inputSchema: askUserInputSchema,
  outputSchema: askUserOutputSchema,
});

export type AskUserUITool = InferUITool<typeof askUserTool>;

/** One-line recap shown in the transcript after the user answers. */
export function summarizeAskUserAnswers(output: AskUserOutput): string {
  if (output.dismissed) return "Skipped Piggy's questions.";
  const lines = output.answers.map((answer) => {
    if (answer.skipped) return `${answer.prompt} — skipped`;
    const parts = [...answer.labels];
    if (answer.other?.trim()) parts.push(answer.other.trim());
    return `${answer.prompt} — ${parts.join(", ") || "no answer"}`;
  });
  return lines.join("\n");
}

/** Build the tool output from a submitted questionnaire form. */
export function askUserOutputFromFormData(
  input: AskUserInput,
  formData: FormData,
): AskUserOutput {
  const answers: AskUserAnswer[] = input.questions.map((question) => {
    const raw = formData
      .getAll(question.id)
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    const byValue = new Map(question.choices.map((c) => [c.value, c.label]));
    const values = raw.filter((value) => byValue.has(value));
    const other = raw.find((value) => !byValue.has(value));
    return {
      id: question.id,
      prompt: question.prompt,
      values,
      labels: values.map((value) => byValue.get(value) ?? value),
      other: other || undefined,
      skipped: values.length === 0 && !other,
    };
  });
  return { answers, dismissed: false };
}
