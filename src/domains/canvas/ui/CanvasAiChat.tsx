"use client";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  applyCanvasTool,
  ensureCanvasFontsLoaded,
  isCanvasToolName,
} from "@/domains/canvas/application/applyCanvasTools";
import { focusCanvasLabel } from "@/domains/canvas/application/focusCanvasLabel";
import { buildBudgetContextFromDashboard } from "@/domains/canvas/domain/budgetContext";
import { getCanvasSnapshot } from "@/domains/canvas/domain/canvasContext";
import { PIGGY_BUBBLE_MAX_CHARS } from "@/domains/canvas/domain/canvasTools";
import {
  AssistantMarkdown,
  PiggyThinking,
  ReasoningBlock,
  ScratchFold,
  SourceList,
  ToolActivity,
} from "@/domains/canvas/ui/CanvasChatParts";
import { PiggyGreeting } from "@/domains/canvas/ui/PiggyGreeting";
import { useCanvasApi } from "@/domains/canvas/ui/canvasApiContext";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import {
  emptyPiggyHistory,
  restorePiggyHistory,
  type PiggyHistory,
} from "@/domains/ledger-ai/domain/piggyHistory";
import {
  PiggyMascot,
  piggyMoodFromChat,
  piggyMoodFromMessage,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import {
  PiggyAssistantMessage,
  PiggyTranscript,
  PiggyTranscriptItem,
  PiggyUserMessage,
} from "@/domains/ledger-ai/ui/PiggyTranscript";
import { useCappedTextReveal } from "@/domains/ledger-ai/ui/useCappedTextReveal";
import { usePiggyHistory } from "@/domains/ledger-ai/ui/usePiggyHistory";
import { dashboardFromPrivateLedger } from "@/domains/vault/application/dashboardFromPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { cn } from "@/lib/utils";
import { logAiUsageFromMessageMetadata } from "@/shared/debug/aiUsageDebug";
import { errorMessage } from "@/shared/lib/error-message";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type SourceUrlUIPart,
  type UIMessage,
} from "ai";
import { ArrowUp, Eraser, Info, Square } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { toastIfOffline } from "@/shared/offline/offlineWriteGuard";

/** How long Piggy's say_bubble line stays before idle greetings resume. */
const BUBBLE_HOLD_MS = 12000;
/** How long "I'm done!" stays on the button after a reply finishes. */
const DONE_HOLD_MS = 3500;

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
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
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
            Piggy advises from your budget, then draws it on the board.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Chat can see the budget numbers you send</li>
            <li>
              Can look up one account, a statement, or an older month when you
              ask
            </li>
            <li>
              Can search the web for general facts (rates, fees, definitions)
              and lists its sources
            </li>
            <li>
              Can hire up to two helper piggies; they talk through your private
              crew mail
            </li>
            <li>Piggy stamps a chart skeleton, then fills your numbers</li>
            <li>
              Thoughts and stamp notes show while Piggy works, then tuck away
            </li>
            <li>Ask for edits — Piggy moves or erases what’s there</li>
            <li>
              When a drawing is done, Piggy drops a short line in the speech
              bubble by the button
            </li>
            <li>Enter sends, Shift+Enter adds a line</li>
            <li>Chat and draft are saved on this browser for your account</li>
            <li>
              Eraser in the header, or scroll past the last reply, clears this
              chat — not the board
            </li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function CanvasCappedMarkdown({
  text,
  live,
}: {
  text: string;
  live?: boolean;
}) {
  const shown = useCappedTextReveal(text, live === true);
  const api = useCanvasApi();
  return (
    <Bubble align="start" variant="piggy">
      <BubbleContent>
        <AssistantMarkdown
          text={shown}
          onLocalRef={api ? (label) => focusCanvasLabel(api, label) : undefined}
        />
      </BubbleContent>
    </Bubble>
  );
}

function AssistantTurn({
  message,
  boardErrors,
  mood,
  live,
  pace,
}: {
  message: UIMessage;
  mood?: PiggyMood;
  /** True while this turn is still streaming. */
  live?: boolean;
  /** Type out text even after the model has already finished. */
  pace?: boolean;
  /** toolCallId -> why the piece did not land on the board. */
  boardErrors: ReadonlyMap<string, string>;
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

  const hasReply = blocks.some(
    (block) => block.kind === "text" && block.text.trim().length > 0,
  );
  const hideScratch = hasReply && !live;
  const rows: Array<
    | { kind: "text"; text: string; key: string }
    | { kind: "error"; part: UIMessage["parts"][number]; key: string }
    | {
        kind: "scratch";
        key: string;
        parts: Array<{ part: UIMessage["parts"][number]; key: string }>;
      }
  > = [];
  for (const block of blocks) {
    if (block.kind === "text") {
      if (block.text.trim().length === 0) continue;
      rows.push(block);
      continue;
    }
    if (isToolUIPart(block.part) && boardErrors.get(block.part.toolCallId)) {
      rows.push({ kind: "error", part: block.part, key: block.key });
      continue;
    }
    const last = rows.at(-1);
    if (last?.kind === "scratch") {
      last.parts.push({ part: block.part, key: block.key });
    } else {
      rows.push({
        kind: "scratch",
        key: `s${block.key}`,
        parts: [{ part: block.part, key: block.key }],
      });
    }
  }
  const sources = message.parts.filter(
    (part): part is SourceUrlUIPart => part.type === "source-url",
  );
  const api = useCanvasApi();
  if (rows.length === 0 && sources.length === 0) return null;

  return (
    <PiggyAssistantMessage
      mood={mood ?? piggyMoodFromMessage(message, boardErrors)}
    >
      <div className="flex min-w-0 flex-col">
        {rows.map((row) => {
          if (row.kind === "text") {
            return (
              <CanvasCappedMarkdown key={row.key} text={row.text} live={pace} />
            );
          }
          if (row.kind === "error" && isToolUIPart(row.part)) {
            return (
              <ToolActivity
                key={row.key}
                part={row.part}
                boardError={boardErrors.get(row.part.toolCallId)}
              />
            );
          }
          if (row.kind !== "scratch") return null;
          return (
            <ScratchFold key={row.key} hidden={hideScratch}>
              {row.parts.map((item) => {
                if (isReasoningUIPart(item.part)) {
                  return <ReasoningBlock key={item.key} part={item.part} />;
                }
                if (isToolUIPart(item.part)) {
                  return <ToolActivity key={item.key} part={item.part} />;
                }
                return null;
              })}
            </ScratchFold>
          );
        })}
        {!live ? (
          <SourceList
            parts={sources}
            onLocalRef={
              api ? (label) => focusCanvasLabel(api, label) : undefined
            }
          />
        ) : null}
      </div>
    </PiggyAssistantMessage>
  );
}

export function CanvasAiChat() {
  const history = usePiggyHistory("canvas", restorePiggyHistory);
  if (!history.ready) {
    return (
      <Button
        variant="ghost"
        disabled
        aria-label="Loading saved Canvas Piggy chat"
        className="h-9 min-w-0 shrink-0 justify-start gap-1.5 rounded-lg border border-border bg-surface-elevated px-2 pr-2 text-sm font-medium text-foreground shadow-md ring-1 ring-foreground/10 [&_svg]:size-5"
      >
        <PiggyMascot mood="thinking" iconClassName="size-8" />
        <PiggyGreeting />
      </Button>
    );
  }
  return (
    <CanvasAiChatSession
      key={history.owner}
      initialHistory={history.initial!}
      saveHistory={history.save}
      historyError={history.error}
    />
  );
}

function CanvasAiChatSession({
  initialHistory,
  saveHistory,
  historyError,
}: {
  initialHistory: PiggyHistory;
  saveHistory: (history: PiggyHistory) => void;
  historyError?: string;
}) {
  const api = useCanvasApi();
  const [open, setOpen] = useState(false);
  const [dockReady, setDockReady] = useState(false);
  const [input, setInput] = useState(initialHistory.draft);
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

  // ref -> element id for this chat, so Piggy can point later arrows/frames/edits
  // at pieces drawn a few steps earlier without a fresh snapshot.
  const refAliases = useRef(new Map(initialHistory.aliases));
  const [boardErrors, setBoardErrors] = useState<ReadonlyMap<string, string>>(
    () => new Map(initialHistory.boardErrors),
  );
  const [bubble, setBubble] = useState<string | null>(null);
  const bubbleTimer = useRef(0);
  const speak = (text: string) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble(text.trim().slice(0, PIGGY_BUBBLE_MAX_CHARS));
    bubbleTimer.current = window.setTimeout(
      () => setBubble(null),
      BUBBLE_HOLD_MS,
    );
  };
  useEffect(() => () => window.clearTimeout(bubbleTimer.current), []);
  const wasBusy = useRef(false);
  const [doneLine, setDoneLine] = useState(false);
  const doneTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(doneTimer.current), []);
  useEffect(() => {
    setDockReady(true);
  }, []);
  // Warm Piggy's fonts once the board exists so the first label is measured
  // with the real face, not a fallback that leaves it clipped.
  useEffect(() => {
    if (api) void ensureCanvasFontsLoaded();
  }, [api]);

  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    messages: initialHistory.messages,
    throttle: 250,
    transport,
    // Tools are acknowledged on the server so one stream carries the whole
    // board; this only kicks in if a request hit the step cap mid-drawing.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (err) => {
      toast.error("Piggy stumbled", {
        description: errorMessage(err, "Chat request failed"),
      });
    },
    onFinish: ({ message }) => {
      logAiUsageFromMessageMetadata("canvas-chat", message.metadata);
    },
    // Fires as soon as a tool call's input is complete, before the server ack
    // arrives, so each piece lands on the board while Piggy keeps talking.
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;
      if (toolCall.toolName === "say_bubble") {
        const { text } = toolCall.input as { text?: string };
        if (text) speak(text);
        return;
      }
      // Memory tools run on the server; nothing to draw.
      if (!isCanvasToolName(toolCall.toolName)) return;

      const fail = (reason: string) => {
        setBoardErrors((prev) =>
          new Map(prev).set(toolCall.toolCallId, reason),
        );
        toast.error("That stroke slipped", { description: reason });
      };

      if (!api) {
        fail("Canvas is still loading");
        return;
      }
      try {
        await applyCanvasTool(
          api,
          toolCall.toolName,
          toolCall.input,
          refAliases.current,
        );
      } catch (err) {
        fail(errorMessage(err, "Tool failed"));
      }
    },
  });

  const bornMessageIds = useRef(new Set(messages.map((message) => message.id)));
  const busy = status === "submitted" || status === "streaming";
  const blocked = encryptedLedger && !cloudProcessing;
  const last = messages.at(-1);
  const showThinking = busy && !hasVisibleParts(last);
  const mood = piggyMoodFromChat({
    status,
    listening: inputFocused || input.trim().length > 0,
    message: last,
    error,
    blocked,
    boardErrors,
  });

  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      window.clearTimeout(doneTimer.current);
      setDoneLine(false);
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    setDoneLine(true);
    doneTimer.current = window.setTimeout(
      () => setDoneLine(false),
      DONE_HOLD_MS,
    );
  }, [busy]);

  const greetingMessage = busy
    ? "Thinking..."
    : doneLine
      ? "I'm done!"
      : (bubble ?? (open ? "Chatting..." : null));

  useEffect(() => {
    saveHistory({
      messages,
      draft: input,
      aliases: [...refAliases.current],
      boardErrors: [...boardErrors],
    });
  }, [messages, input, boardErrors, saveHistory]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || busy || blocked) return;
    if (toastIfOffline()) return;
    void sendMessage({ text: value });
    setInput("");
  };

  const clearChat = () => {
    void stop();
    setMessages([]);
    setInput("");
    setBoardErrors(new Map());
    refAliases.current = new Map();
    saveHistory(emptyPiggyHistory());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit(input);
    }
  };

  const chatDock = (
    <div className="pointer-events-auto fixed top-16 right-3 z-2000 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden rounded-xl border border-border bg-background p-0 shadow-lg ring-1 ring-foreground/10">
      <PopoverHeader className="flex-row items-center gap-1.5 border-b border-accent/15 bg-linear-to-r from-accent-subtle/80 to-transparent px-3 py-2.5">
        <PopoverTitle className="flex min-w-0 flex-1 items-center gap-1.5">
          Canvas Piggy
          <CanvasPiggyInfo />
        </PopoverTitle>
        <PopoverDescription className="sr-only">
          Chat can see the budget numbers you send. Piggy draws on the board.
        </PopoverDescription>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
          disabled={messages.length === 0 && !error}
          aria-label="Clear chat"
          title="Clear chat"
          onClick={clearChat}
        >
          <Eraser className="size-3.5" />
        </Button>
      </PopoverHeader>

      {blocked ? (
        <p className="border-b border-border bg-warning-subtle px-3 py-2 text-xs text-warning">
          Turn on Cloud Processing in Modules before sending budget data to
          Piggy.
        </p>
      ) : null}

      {historyError && (
        <p role="status" className="px-3 py-2 text-xs text-warning">
          {historyError}
        </p>
      )}

      <PiggyTranscript
        ariaLabel="Canvas Piggy conversation"
        className="h-80"
        onClearChat={clearChat}
        canClearChat={messages.length > 0 || !!error}
      >
        {messages.length === 0 ? (
          <PiggyTranscriptItem messageId="piggy-empty">
            <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent-subtle ring-4 ring-accent-subtle/50">
                <PiggyMascot mood="happy" iconClassName="size-12" />
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
          </PiggyTranscriptItem>
        ) : (
          messages.map((message) => {
            if (message.role === "user") {
              const text = messageText(message);
              if (!text) return null;
              return (
                <PiggyTranscriptItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor
                >
                  <PiggyUserMessage text={text} />
                </PiggyTranscriptItem>
              );
            }
            return (
              <PiggyTranscriptItem key={message.id} messageId={message.id}>
                <AssistantTurn
                  message={message}
                  boardErrors={boardErrors}
                  live={busy && message.id === last?.id}
                  pace={!bornMessageIds.current.has(message.id)}
                  mood={busy && message.id === last?.id ? mood : undefined}
                />
              </PiggyTranscriptItem>
            );
          })
        )}
        {showThinking ? (
          <PiggyTranscriptItem messageId="piggy-thinking">
            <PiggyAssistantMessage mood="thinking">
              <PiggyThinking label={thinkingLabel(status, last)} />
            </PiggyAssistantMessage>
          </PiggyTranscriptItem>
        ) : null}
        {error ? (
          <PiggyTranscriptItem messageId="piggy-error">
            <PiggyAssistantMessage mood="sad">
              <p className="rounded-lg border border-danger/20 bg-danger-subtle px-3 py-2 text-xs text-danger">
                {error.message}
              </p>
            </PiggyAssistantMessage>
          </PiggyTranscriptItem>
        ) : null}
      </PiggyTranscript>

      <form
        className="border-t border-border bg-surface p-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(input);
        }}
      >
        <InputGroup className="items-center border-accent/25 has-[[data-slot=input-group-control]:focus-visible]:border-accent has-[[data-slot=input-group-control]:focus-visible]:ring-accent/30">
          <InputGroupTextarea
            value={input}
            rows={1}
            onChange={(event) => setInput(event.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={onKeyDown}
            placeholder={busy ? "Piggy is busy…" : "Ask or draw…"}
            disabled={blocked}
            aria-label="Message Canvas Piggy"
            className="max-h-28 min-h-8 px-3 py-1.5 text-sm leading-5"
          />
          <InputGroupAddon align="inline-end" className="self-center">
            {busy ? (
              <InputGroupButton
                size="icon-sm"
                variant="ghost"
                onClick={() => void stop()}
                aria-label="Stop"
                className="size-8 rounded-lg"
              >
                <Square className="size-3.5 fill-current" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="ghost"
                disabled={blocked || !input.trim()}
                aria-label="Send"
                className="size-8 rounded-lg disabled:opacity-40"
              >
                <ArrowUp className="size-3.5" strokeWidth={2.25} />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        title="Canvas Piggy"
        aria-label="Canvas Piggy"
        aria-expanded={open}
        className={cn(
          "h-9 min-w-0 shrink-0 justify-start gap-1.5 rounded-lg border border-border bg-surface-elevated px-2 pr-2 text-sm font-medium text-foreground shadow-md ring-1 ring-foreground/10 hover:bg-muted hover:text-foreground [&_svg]:size-5",
          busy && !open && "ring-2 ring-accent/35",
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <PiggyMascot mood={mood} iconClassName="size-8" />
        <PiggyGreeting paused={open} message={greetingMessage} />
      </Button>
      {open ? (dockReady ? createPortal(chatDock, document.body) : null) : null}
    </>
  );
}
