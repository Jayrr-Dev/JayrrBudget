"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { ArrowUp, Info, Square } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { applyCanvasTool } from "@/domains/canvas/application/applyCanvasTools";
import { buildBudgetContextFromDashboard } from "@/domains/canvas/domain/budgetContext";
import { getCanvasSnapshot } from "@/domains/canvas/domain/canvasContext";
import {
  AssistantMarkdown,
  PiggyThinking,
  ReasoningBlock,
  ToolActivity,
} from "@/domains/canvas/ui/CanvasChatParts";
import { useCanvasApi } from "@/domains/canvas/ui/canvasApiContext";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import {
  PiggyMascot,
  piggyMoodFromChat,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import { dashboardFromPrivateLedger } from "@/domains/vault/application/dashboardFromPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/shared/lib/error-message";

const SUGGESTIONS = [
  "Sketch where my money goes",
  "Draw my top merchants",
  "Map a savings plan",
] as const;

function messageText(message: UIMessage) {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

/** Whether the last assistant turn has produced anything visible yet. */
function hasVisibleParts(message: UIMessage | undefined) {
  if (!message || message.role !== "assistant") return false;
  return message.parts.some(
    (part) =>
      (isTextUIPart(part) && part.text.trim().length > 0) ||
      (isReasoningUIPart(part) && part.text.trim().length > 0) ||
      isToolUIPart(part),
  );
}

function thinkingLabel(status: string, last: UIMessage | undefined) {
  if (status === "submitted") return "Piggy is thinking…";
  const streamingTool = last?.parts.some(
    (part) => isToolUIPart(part) && part.state === "input-streaming",
  );
  return streamingTool ? "Piggy is sketching…" : "Piggy is writing…";
}

function CanvasPiggyInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle"
          aria-label="About Canvas Piggy"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="z-[2100] w-72 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Canvas Piggy</PopoverTitle>
          <PopoverDescription>
            Piggy draws on the board from your budget numbers.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Chat can see the budget numbers you send</li>
            <li>Sketches, notes, arrows, and frames land on the board</li>
            <li>Ask for edits — Piggy moves or erases by id</li>
            <li>Enter sends, Shift+Enter adds a line</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function AssistantTurn({
  message,
  talking,
}: {
  message: UIMessage;
  talking: boolean;
}) {
  // Group consecutive text parts so streaming chunks render as one bubble.
  const blocks: Array<
    | { kind: "text"; text: string; key: string }
    | { kind: "part"; part: UIMessage["parts"][number]; key: string }
  > = [];
  message.parts.forEach((part, index) => {
    if (isTextUIPart(part)) {
      const prev = blocks.at(-1);
      if (prev?.kind === "text") {
        prev.text += part.text;
      } else {
        blocks.push({ kind: "text", text: part.text, key: `t${index}` });
      }
      return;
    }
    if (isReasoningUIPart(part) || isToolUIPart(part)) {
      blocks.push({ kind: "part", part, key: `p${index}` });
    }
  });

  const visible = blocks.filter(
    (block) => block.kind !== "text" || block.text.trim().length > 0,
  );
  if (visible.length === 0) return null;

  return (
    <Message align="start" className="motion-safe:animate-piggy-pop">
      <MessageAvatar className="size-7 self-start bg-accent-subtle">
        <PiggyMascot mood={talking ? "talk" : "still"} iconClassName="size-3.5" />
      </MessageAvatar>
      <MessageContent className="gap-1.5">
        {visible.map((block) => {
          if (block.kind === "text") {
            return (
              <Bubble key={block.key} align="start" variant="piggy">
                <BubbleContent>
                  <AssistantMarkdown text={block.text} />
                </BubbleContent>
              </Bubble>
            );
          }
          if (isReasoningUIPart(block.part)) {
            return <ReasoningBlock key={block.key} part={block.part} />;
          }
          if (isToolUIPart(block.part)) {
            return <ToolActivity key={block.key} part={block.part} />;
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}

export function CanvasAiChat() {
  const api = useCanvasApi();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const encryptedLedger = useFeatureFlag("encryptedLedger");
  const cloudProcessing = useFeatureFlag("cloudProcessing");
  const privateLedger = usePrivateLedger();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/canvas/chat",
        prepareSendMessagesRequest: ({ messages, id, body }) => {
          const useClientBudget = encryptedLedger;
          const budget = useClientBudget
            ? privateLedger.unlocked
              ? buildBudgetContextFromDashboard(
                  dashboardFromPrivateLedger(privateLedger.ledger),
                )
              : { error: "Sign in again, then try chat." }
            : undefined;
          return {
            body: {
              ...body,
              id,
              messages,
              canvas: api ? getCanvasSnapshot(api) : null,
              useClientBudget,
              budget,
            },
          };
        },
      }),
    [api, encryptedLedger, privateLedger.ledger, privateLedger.unlocked],
  );

  const { messages, sendMessage, addToolOutput, status, error, stop } =
    useChat({
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onError: (err) => {
        toast.error("Piggy stumbled", {
          description: errorMessage(err, "Chat request failed"),
        });
      },
      async onToolCall({ toolCall }) {
        if (toolCall.dynamic) return;

        try {
          if (!api) {
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              state: "output-error",
              errorText: "Canvas is still loading",
            });
            return;
          }
          const output = applyCanvasTool(
            api,
            toolCall.toolName,
            toolCall.input,
          );
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output,
          });
        } catch (err) {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: errorMessage(err, "Tool failed"),
          });
          toast.error("Canvas tool failed", {
            description: errorMessage(err, "Tool failed"),
          });
        }
      },
    });

  const busy = status === "submitted" || status === "streaming";
  const blocked = encryptedLedger && !cloudProcessing;
  const last = messages.at(-1);
  const showThinking = busy && !hasVisibleParts(last);
  const mood: PiggyMood = open
    ? piggyMoodFromChat({
        status,
        listening: inputFocused || input.trim().length > 0,
      })
    : busy
      ? "think"
      : "still";

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy || blocked) return;
    void sendMessage({ text: value });
    setInput("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(input);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          title="Canvas Piggy"
          aria-label="Canvas Piggy"
          className={cn(
            "bg-[var(--surface)] text-accent hover:text-accent",
            busy && !open && "ring-2 ring-accent/40 motion-safe:animate-pulse",
          )}
        >
          <PiggyMascot mood={mood} iconClassName="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="z-[2000] flex w-[min(24rem,calc(100vw-1rem))] flex-col gap-0 overflow-hidden border-accent/25 p-0 shadow-lg"
      >
        <PopoverHeader className="flex-row items-center gap-2 border-b border-accent/15 bg-linear-to-r from-accent-subtle/80 to-transparent px-3 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle ring-1 ring-accent/20">
            <PiggyMascot mood={mood} iconClassName="size-4" />
          </span>
          <PopoverTitle className="flex items-center gap-1.5">
            Canvas Piggy
            <CanvasPiggyInfo />
          </PopoverTitle>
          <PopoverDescription className="sr-only">
            Chat can see the budget numbers you send. Piggy draws on the board.
          </PopoverDescription>
        </PopoverHeader>

        {blocked ? (
          <p className="border-b border-border bg-warning-subtle px-3 py-2 text-xs text-warning">
            Turn on Cloud Processing in Modules before sending ledger data to
            Piggy.
          </p>
        ) : null}

        <div className="h-80 bg-background">
          <MessageScrollerProvider autoScroll defaultScrollPosition="end">
            <MessageScroller>
              <MessageScrollerViewport
                aria-label="Canvas Piggy conversation"
                className="px-3 py-3"
              >
                <MessageScrollerContent className="gap-3">
                  {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
                      <span className="flex size-12 items-center justify-center rounded-full bg-accent-subtle ring-4 ring-accent-subtle/50">
                        <PiggyMascot mood="idle" iconClassName="size-6" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          Ask Piggy to sketch your money
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Charts, flows, and notes land on the board.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            disabled={busy || blocked}
                            onClick={() => submit(suggestion)}
                            className="rounded-full border border-accent/20 bg-accent-subtle/40 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent-subtle disabled:opacity-50"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => {
                      if (message.role === "user") {
                        const text = messageText(message);
                        if (!text) return null;
                        return (
                          <MessageScrollerItem
                            key={message.id}
                            messageId={message.id}
                          >
                            <Message
                              align="end"
                              className="motion-safe:animate-piggy-pop"
                            >
                              <MessageContent>
                                <Bubble align="end" variant="default">
                                  <BubbleContent className="whitespace-pre-wrap">
                                    {text}
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                          </MessageScrollerItem>
                        );
                      }
                      return (
                        <MessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                        >
                          <AssistantTurn
                            message={message}
                            talking={
                              status === "streaming" && message.id === last?.id
                            }
                          />
                        </MessageScrollerItem>
                      );
                    })
                  )}
                  {showThinking ? (
                    <MessageScrollerItem messageId="piggy-thinking">
                      <PiggyThinking label={thinkingLabel(status, last)} />
                    </MessageScrollerItem>
                  ) : null}
                  {error ? (
                    <p className="rounded-lg border border-danger/20 bg-danger-subtle px-3 py-2 text-xs text-danger">
                      {error.message}
                    </p>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton aria-label="Scroll to latest" />
            </MessageScroller>
          </MessageScrollerProvider>
        </div>

        <form
          className="border-t border-border bg-surface p-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit(input);
          }}
        >
          <InputGroup className="items-end border-accent/25 has-[[data-slot=input-group-control]:focus-visible]:border-accent has-[[data-slot=input-group-control]:focus-visible]:ring-accent/30">
            <InputGroupTextarea
              value={input}
              rows={1}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={busy ? "Piggy is busy…" : "Ask or draw…"}
              disabled={blocked}
              aria-label="Message Canvas Piggy"
              className="max-h-28 min-h-9 px-3 text-sm"
            />
            <InputGroupAddon align="inline-end" className="self-end pb-1">
              {busy ? (
                <InputGroupButton
                  size="icon-sm"
                  variant="secondary"
                  onClick={() => void stop()}
                  aria-label="Stop"
                  className="rounded-full"
                >
                  <Square className="size-3 fill-current" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  disabled={blocked || !input.trim()}
                  aria-label="Send"
                  className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <ArrowUp className="size-3.5" strokeWidth={2.5} />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </form>
      </PopoverContent>
    </Popover>
  );
}
