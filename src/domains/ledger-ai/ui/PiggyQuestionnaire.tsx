"use client";

import { Button } from "@/components/ui/button";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
  askUserOutputFromFormData,
  summarizeAskUserAnswers,
  type AskUserInput,
  type AskUserOutput,
} from "@/domains/ledger-ai/domain/askUserTool";
import { useMemo, type FormEvent } from "react";

/**
 * Piggy's in-chat question card. Wraps the shadcn Questionnaire so one
 * `ask_user` tool call becomes a small multi-step form; submitting posts the
 * answers back to the model.
 */
export function PiggyQuestionnaire({
  input,
  onSubmit,
  onDismiss,
}: {
  input: AskUserInput;
  onSubmit: (output: AskUserOutput) => void;
  onDismiss: () => void;
}) {
  const items = useMemo(
    () =>
      input.questions.map((question) => ({
        name: question.id,
        required: question.required !== false,
        choices: question.choices.map((choice) => ({ value: choice.value })),
      })),
    [input.questions],
  );
  const multi = input.questions.length > 1;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(askUserOutputFromFormData(input, new FormData(event.currentTarget)));
  };

  return (
    <div className="w-full rounded-xl border border-border bg-surface p-3 text-sm shadow-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {input.title?.trim() || "Piggy has a question"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={onDismiss}
        >
          Skip all
        </Button>
      </div>

      <Questionnaire
        items={items}
        onSubmit={handleSubmit}
        shortcuts={multi ? undefined : "letters"}
        className="gap-3"
      >
        {multi ? <QuestionnaireProgress /> : null}
        {input.questions.map((question) => (
          <QuestionnaireItem
            key={question.id}
            name={question.id}
            required={question.required !== false}
            multiple={question.multiple}
            className="gap-2.5"
          >
            <QuestionnaireTitle className="text-sm">
              {question.prompt}
            </QuestionnaireTitle>
            {question.description ? (
              <QuestionnaireDescription className="text-xs">
                {question.description}
              </QuestionnaireDescription>
            ) : null}
            <QuestionnaireChoices className="gap-1.5">
              {question.choices.map((choice) => (
                <QuestionnaireChoice
                  key={choice.value}
                  value={choice.value}
                  className="min-h-9 px-3 py-1.5 text-xs"
                >
                  <span className="font-medium">{choice.label}</span>
                  {choice.description ? (
                    <QuestionnaireChoiceDescription className="text-xs">
                      {choice.description}
                    </QuestionnaireChoiceDescription>
                  ) : null}
                </QuestionnaireChoice>
              ))}
              {question.allowOther ? (
                <QuestionnaireInput
                  aria-label="Another answer"
                  placeholder="Something else…"
                  className="min-h-9 text-xs md:text-xs"
                />
              ) : null}
            </QuestionnaireChoices>
            <QuestionnaireError className="mt-0 text-xs" />
          </QuestionnaireItem>
        ))}
        <QuestionnaireActions className="min-h-8">
          {multi ? <QuestionnairePrevious size="xs" /> : null}
          <QuestionnaireSkip size="xs" />
          {multi ? <QuestionnaireNext size="xs" /> : null}
          <QuestionnaireSubmit size="xs">Send to Piggy</QuestionnaireSubmit>
        </QuestionnaireActions>
      </Questionnaire>
    </div>
  );
}

/** Compact recap of answers once the tool call has an output. */
export function PiggyQuestionnaireAnswers({ output }: { output: AskUserOutput }) {
  return (
    <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {summarizeAskUserAnswers(output)}
    </p>
  );
}
