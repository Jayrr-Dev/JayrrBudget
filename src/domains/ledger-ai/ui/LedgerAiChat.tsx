"use client";

import { ChromeTab, ChromeTabStrip } from "@/components/layout/ChromeTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildBudgetContextFromDashboard } from "@/domains/canvas/domain/budgetContext";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import {
  piggyMoodFromChat,
  piggyMoodFromMessage,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import {
  PiggyAssistantMessage,
  PiggyCappedText,
  PiggyTextBubble,
  PiggyTranscript,
  PiggyTranscriptItem,
  PiggyUserMessage,
} from "@/domains/ledger-ai/ui/PiggyTranscript";
import { useScratchNote } from "@/domains/scratch-note/scratchNoteStore";
import { dashboardFromPrivateLedger } from "@/domains/vault/application/dashboardFromPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import { logAiUsageFromMessageMetadata } from "@/shared/debug/aiUsageDebug";
import {
  ASK_USER_TOOL_NAME,
  isAskUserPart,
  type AskUserOutput,
  type PiggyUIMessage,
} from "@/domains/ledger-ai/domain/askUserTool";
import {
  PiggyQuestionnaire,
  PiggyQuestionnaireAnswers,
} from "@/domains/ledger-ai/ui/PiggyQuestionnaire";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { Info, PlusIcon, SendHorizonal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { toast } from "sonner";
import type { ComponentProps } from "react";
import { emptyPiggyHistory, restorePiggyHistory, restorePiggyChatIndex, type PiggyChatIndex, type PiggyHistory } from "../domain/piggyHistory";
import { usePiggyHistory } from "./usePiggyHistory";

const MAX_PIGGY_TABS = 8;

type PiggyTab = {
  id: string;
  name: string;
};

function createPiggyTab(name: string): PiggyTab {
  return { id: crypto.randomUUID(), name };
}

function nextPiggyName(tabs: PiggyTab[]) {
  const used = new Set(tabs.map((tab) => tab.name));
  if (!used.has("Piggy")) return "Piggy";
  let index = 2;
  while (used.has(`Piggy ${index}`)) index += 1;
  return `Piggy ${index}`;
}

function messageText(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("");
}

function PiggyAboutInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
          aria-label="About Piggy"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-72 gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1.5">
          <PopoverTitle>Piggy</PopoverTitle>
          <PopoverDescription>
            A financial advisor mascot who uses your budget numbers, then can
            tidy transactions, the store sheet, and notes.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Advice from your spend, income, bills, and savings</li>
            <li>Recategorize your transactions</li>
            <li>Edit sections, categories, and subcategories</li>
            <li>Read and update your store sheet and notes</li>
            <li>Asks you a quick multiple-choice question when unsure</li>
            <li>Summarize spend by merchant or category</li>
            <li>Open extra tabs for separate chats</li>
            <li>Chats and drafts are saved on this browser for your account</li>
          </ul>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

function PiggyChatPane(props: Omit<ComponentProps<typeof PiggyChatPaneSession>, "initialHistory" | "saveHistory">) {
  const history = usePiggyHistory(`ledger:${props.chatId}`, restorePiggyHistory);
  return <>
    {history.error && <p role="status" className="px-3 py-2 text-xs text-warning">{history.error}</p>}
    {history.ready ? <PiggyChatPaneSession key={`${history.owner}:${props.chatId}`} {...props} initialHistory={history.initial!} saveHistory={history.save} /> : <p className="p-3 text-xs text-muted-foreground">Loading saved chat…</p>}
  </>;
}

function PiggyChatPaneSession({
  chatId,
  tabName,
  active,
  open,
  blocked,
  transport,
  onMoodChange,
  initialHistory,
  saveHistory,
}: {
  initialHistory: PiggyHistory;
  saveHistory: (value: PiggyHistory) => void;
  chatId: string;
  tabName: string;
  active: boolean;
  open: boolean;
  blocked: boolean;
  transport: DefaultChatTransport<PiggyUIMessage>;
  onMoodChange?: (mood: PiggyMood) => void;
}) {
  const [input, setInput] = useState(initialHistory.draft);
  const [inputFocused, setInputFocused] = useState(false);

  const { messages, sendMessage, status, error, addToolResult } =
    useChat<PiggyUIMessage>({
    id: chatId,
    messages: initialHistory.messages as PiggyUIMessage[],
    throttle: 250,
    transport,
    // ask_user has no server execute: once the user answers in the card,
    // resume the model with the tool output.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (err) => {
      toast.error("Piggy stumbled", {
        description: errorMessage(err, "Chat request failed"),
      });
    },
    onFinish: ({ message }) => {
      logAiUsageFromMessageMetadata("ledger-chat", message.metadata);
    },
  });

  useEffect(() => {
    saveHistory({ ...emptyPiggyHistory(), messages, draft: input });
  }, [input, messages, saveHistory]);

  const busy = status === "submitted" || status === "streaming";
  const lastMessage = messages.at(-1);
  // Piggy is waiting on a questionnaire answer; hold the text box until then.
  const awaitingAnswer =
    !busy &&
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) => isAskUserPart(part) && part.state === "input-available",
    );
  const answerAsk = (toolCallId: string, output: AskUserOutput) =>
    void addToolResult({ tool: ASK_USER_TOOL_NAME, toolCallId, output });
  const bornMessageIds = useRef(new Set(messages.map((message) => message.id)));
  const mood = piggyMoodFromChat({
    status,
    listening: inputFocused || input.trim().length > 0,
    message: messages.at(-1),
    error,
    blocked,
  });

  useEffect(() => {
    if (!active) return;
    onMoodChange?.(open ? mood : "still");
  }, [active, mood, onMoodChange, open]);

  return (
    <div className="flex flex-col" hidden={!active}>
      {blocked ? (
        <p className="border-b border-border bg-warning-subtle px-3 py-2 text-xs text-warning">
          Turn on Cloud Processing in Modules before sending budget data to
          Piggy.
        </p>
      ) : null}

      <PiggyTranscript
        ariaLabel={`${tabName} conversation`}
        className="h-64"
      >
        {messages.length === 0 ? (
          <PiggyTranscriptItem messageId="piggy-empty">
            <PiggyAssistantMessage mood="happy">
              <PiggyTextBubble>
                <p className="font-medium">What&apos;s rattling in the bank?</p>
                <p className="mt-1.5 text-xs leading-relaxed">
                  Try &quot;How much did I spend on groceries last month?&quot;
                  {" "}or &quot;Move Uber Eats to Food / Delivery.&quot;
                </p>
              </PiggyTextBubble>
            </PiggyAssistantMessage>
          </PiggyTranscriptItem>
        ) : (
          messages.map((message) => {
            const text = messageText(message.parts ?? []);
            const asks = message.parts.filter(isAskUserPart);
            if (!text && asks.length === 0) return null;
            const assistantTalking =
              message.role === "assistant" &&
              status === "streaming" &&
              message.id === lastMessage?.id;
            return (
              <PiggyTranscriptItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                {message.role === "user" ? (
                  <PiggyUserMessage text={text} />
                ) : (
                  <PiggyAssistantMessage
                    mood={assistantTalking ? mood : piggyMoodFromMessage(message)}
                  >
                    {text ? (
                      <PiggyTextBubble>
                        <PiggyCappedText
                          text={text}
                          live={!bornMessageIds.current.has(message.id)}
                        />
                      </PiggyTextBubble>
                    ) : null}
                    {asks.map((part) => {
                      if (part.state === "output-available") {
                        return (
                          <PiggyQuestionnaireAnswers
                            key={part.toolCallId}
                            output={part.output}
                          />
                        );
                      }
                      if (part.state !== "input-available") return null;
                      return (
                        <PiggyQuestionnaire
                          key={part.toolCallId}
                          input={part.input}
                          onSubmit={(output) => answerAsk(part.toolCallId, output)}
                          onDismiss={() =>
                            answerAsk(part.toolCallId, {
                              answers: [],
                              dismissed: true,
                            })
                          }
                        />
                      );
                    })}
                  </PiggyAssistantMessage>
                )}
              </PiggyTranscriptItem>
            );
          })
        )}
        {busy && (status === "submitted" || lastMessage?.role !== "assistant" || !messageText(lastMessage?.parts ?? [])) ? (
          <PiggyTranscriptItem messageId="piggy-thinking">
            <PiggyAssistantMessage mood="thinking">
              <p role="status" className="py-2 text-xs text-muted-foreground">Piggy is thinking…</p>
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
        className="flex items-center gap-1.5 border-t border-border bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = input.trim();
          if (!value || busy || blocked || awaitingAnswer) return;
          void sendMessage({ text: value });
          setInput("");
        }}
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder={
            awaitingAnswer ? "Answer Piggy above, or Skip all" : `Ask ${tabName}…`
          }
          disabled={busy || blocked || awaitingAnswer}
          className="h-8"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={busy || blocked || awaitingAnswer || !input.trim()}
          aria-label="Send"
        >
          <SendHorizonal className="size-3.5" />
        </Button>
      </form>
    </div>
  );
}

export function LedgerAiChat(props: Omit<ComponentProps<typeof LedgerAiChatSession>, "initialIndex" | "saveIndex" | "historyError">) {
  const history = usePiggyHistory("ledger-index", restorePiggyChatIndex);
  if (!history.ready) return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
      <PopoverContent side={props.contentSide ?? "top"} align="end">
        <p className="text-xs text-muted-foreground">Loading saved Piggy chats…</p>
      </PopoverContent>
    </Popover>
  );
  return <LedgerAiChatSession key={history.owner} {...props} initialIndex={history.initial!} saveIndex={history.save} historyError={history.error} />;
}

function LedgerAiChatSession({
  open,
  onOpenChange,
  onMoodChange,
  trigger,
  contentSide = "top",
  initialIndex,
  saveIndex,
  historyError,
}: {
  historyError?: string;
  initialIndex: PiggyChatIndex;
  saveIndex: (value: PiggyChatIndex) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoodChange?: (mood: PiggyMood) => void;
  trigger: ReactElement;
  contentSide?: "top" | "bottom";
}) {
  const [tabs, setTabs] = useState<PiggyTab[]>(initialIndex.tabs);
  const [activeId, setActiveId] = useState(initialIndex.activeId);
  useEffect(() => { saveIndex({ tabs, activeId }); }, [tabs, activeId, saveIndex]);
  const encryptedLedger = useFeatureFlag("encryptedLedger");
  const cloudProcessing = useFeatureFlag("cloudProcessing");
  const privateLedger = usePrivateLedger();
  const storeSheet = useScratchNote();
  const blocked = encryptedLedger && !cloudProcessing;

  const transport = useMemo(
    () =>
      new DefaultChatTransport<PiggyUIMessage>({
        api: "/api/ledger/chat",
        prepareSendMessagesRequest: ({ messages, id, body }) => {
          const useClientBudget = encryptedLedger;
          let budget:
            | ReturnType<typeof buildBudgetContextFromDashboard>
            | { error: string }
            | undefined;
          if (useClientBudget) {
            budget = privateLedger.unlocked
              ? buildBudgetContextFromDashboard(
                  dashboardFromPrivateLedger(privateLedger.ledger),
                )
              : { error: "Unlock the vault, then try chat." };
          }
          return {
            body: {
              ...body,
              id,
              messages,
              useClientBudget,
              budget,
              storeSheet,
            },
          };
        },
      }),
    [encryptedLedger, privateLedger.ledger, privateLedger.unlocked, storeSheet],
  );

  const addTab = () => {
    if (tabs.length >= MAX_PIGGY_TABS) return;
    const tab = createPiggyTab(nextPiggyName(tabs));
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);
    if (activeId === tabId) {
      const fallback = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
      setActiveId(fallback!.id);
    }
  };

  const renameTab = (tabId: string, name: string) => {
    setTabs((current) =>
      current.map((tab) => (tab.id === tabId ? { ...tab, name } : tab)),
    );
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side={contentSide}
        sideOffset={8}
        className="pointer-events-auto w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden border border-[var(--border)] bg-[var(--background)] p-0 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="relative border-b border-[var(--border)] bg-[var(--muted)]/25">
          <ChromeTabStrip
            ariaLabel="Piggy chats"
            trailing={
              <>
                <button
                  type="button"
                  aria-label="Add Piggy tab"
                  title={
                    tabs.length >= MAX_PIGGY_TABS
                      ? `Up to ${MAX_PIGGY_TABS} chats`
                      : "Add tab"
                  }
                  disabled={tabs.length >= MAX_PIGGY_TABS}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-accent hover:bg-accent-subtle hover:text-accent disabled:pointer-events-none disabled:opacity-40"
                  onClick={addTab}
                >
                  <PlusIcon className="size-3" strokeWidth={2} />
                </button>
                <PiggyAboutInfo />
              </>
            }
          >
            {tabs.map((tab) => (
              <ChromeTab
                key={tab.id}
                name={tab.name}
                isActive={tab.id === activeId}
                canClose={tabs.length > 1}
                onSelect={() => setActiveId(tab.id)}
                onClose={() => closeTab(tab.id)}
                onRename={(name) => renameTab(tab.id, name)}
              />
            ))}
          </ChromeTabStrip>
        </div>
        <p className="sr-only">
          Ask for money advice from your numbers, or change your own budget,
          store sheet, and notes. Recategorize transactions, edit sections and
          categories, or summarize spend. Each tab is a separate chat.
        </p>

        {historyError && <p role="status" className="px-3 py-2 text-xs text-warning">{historyError}</p>}
        {tabs.map((tab) => (
          <PiggyChatPane
            key={tab.id}
            chatId={tab.id}
            tabName={tab.name}
            active={tab.id === activeId}
            open={open}
            blocked={blocked}
            transport={transport}
            onMoodChange={onMoodChange}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
