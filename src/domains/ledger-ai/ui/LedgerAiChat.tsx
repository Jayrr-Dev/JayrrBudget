"use client";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
} from "@/components/ui/message";
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
  PiggyMascot,
  piggyMoodFromChat,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import { useScratchNote } from "@/domains/scratch-note/scratchNoteStore";
import { dashboardFromPrivateLedger } from "@/domains/vault/application/dashboardFromPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Info, SendHorizonal } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";

function messageText(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("");
}

export function LedgerAiChat({
  open,
  onOpenChange,
  onMoodChange,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoodChange?: (mood: PiggyMood) => void;
  trigger: ReactElement;
}) {
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const encryptedLedger = useFeatureFlag("encryptedLedger");
  const cloudProcessing = useFeatureFlag("cloudProcessing");
  const privateLedger = usePrivateLedger();
  const storeSheet = useScratchNote();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
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

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onError: (err) => {
      toast.error("Piggy stumbled", {
        description: errorMessage(err, "Chat request failed"),
      });
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const blocked = encryptedLedger && !cloudProcessing;
  const mood = piggyMoodFromChat({
    status,
    listening: inputFocused || input.trim().length > 0,
  });

  useEffect(() => {
    onMoodChange?.(open ? mood : "still");
  }, [mood, onMoodChange, open]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="pointer-events-auto w-[min(24rem,calc(100vw-1rem))] gap-3 border border-[var(--border)] bg-[var(--background)] p-3 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <PopoverHeader className="gap-1">
          <PopoverTitle className="flex items-center gap-1.5">
            <PiggyMascot mood={mood} />
            Piggy
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent-subtle hover:text-accent"
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
                    A cheerful piggy bank who can read and tidy your ledger,
                    store sheet, and notes.
                  </PopoverDescription>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    <li>Recategorize your transactions</li>
                    <li>Edit sections, categories, and subcategories</li>
                    <li>Read and update your store sheet and notes</li>
                    <li>Summarize spend by merchant or category</li>
                  </ul>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </PopoverTitle>
          <PopoverDescription className="sr-only">
            Ask about your numbers, or change your own ledger, store sheet, and
            notes. Recategorize transactions, edit sections and categories, or
            summarize spend.
          </PopoverDescription>
        </PopoverHeader>

        {blocked ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Turn on Cloud Processing in Modules before sending ledger data to
            Piggy.
          </p>
        ) : null}

        <MessageGroup className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
          {messages.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">
              What&apos;s rattling in the bank? Try &quot;How much did I spend
              on groceries last month?&quot; or &quot;Move Uber Eats to Food /
              Delivery.&quot;
            </p>
          ) : (
            messages.map((message) => {
              const text = messageText(message.parts ?? []);
              if (!text) return null;
              const align = message.role === "user" ? "end" : "start";
              const assistantTalking =
                message.role === "assistant" &&
                status === "streaming" &&
                message.id === messages.at(-1)?.id;
              return (
                <Message key={message.id} align={align}>
                  {message.role === "assistant" ? (
                    <MessageAvatar className="size-7 bg-accent-subtle">
                      <PiggyMascot
                        mood={assistantTalking ? "talk" : "still"}
                        iconClassName="size-3.5"
                      />
                    </MessageAvatar>
                  ) : null}
                  <MessageContent>
                    <Bubble
                      align={align}
                      variant={
                        message.role === "user" ? "default" : "secondary"
                      }
                    >
                      <BubbleContent>{text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              );
            })
          )}
        </MessageGroup>

        {error ? <p className="text-xs text-red-700">{error.message}</p> : null}

        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const value = input.trim();
            if (!value || busy || blocked) return;
            void sendMessage({ text: value });
            setInput("");
          }}
        >
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Ask Piggy…"
            disabled={busy || blocked}
            className="h-8"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={busy || blocked || !input.trim()}
            aria-label="Send"
          >
            <SendHorizonal className="size-3.5" />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
