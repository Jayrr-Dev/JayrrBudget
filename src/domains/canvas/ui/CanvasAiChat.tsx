"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { MessageCircle, SendHorizonal } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DefaultQuickActions,
  DefaultQuickActionsContent,
  TldrawUiButton,
  useEditor,
} from "tldraw";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Message,
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
import { applyCanvasTool } from "@/domains/canvas/application/applyCanvasTools";
import { buildBudgetContextFromDashboard } from "@/domains/canvas/domain/budgetContext";
import { getCanvasSnapshot } from "@/domains/canvas/domain/canvasContext";
import { dashboardFromPrivateLedger } from "@/domains/vault/application/dashboardFromPrivateLedger";
import { useFeatureFlag } from "@/domains/feature-flags/ui/useFeatureFlag";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { errorMessage } from "@/shared/lib/error-message";

function messageText(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("");
}

export function CanvasAiChat() {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
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
              ? buildBudgetContextFromDashboard(dashboardFromPrivateLedger(privateLedger.ledger))
              : { error: "Sign in again, then try chat." }
            : undefined;
          return {
            body: {
              ...body,
              id,
              messages,
              canvas: getCanvasSnapshot(editor),
              useClientBudget,
              budget,
            },
          };
        },
      }),
    [editor, encryptedLedger, privateLedger.ledger, privateLedger.unlocked],
  );

  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError: (err) => {
      toast.error("Canvas AI failed", {
        description: errorMessage(err, "Chat request failed"),
      });
    },
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;

      try {
        const output = applyCanvasTool(
          editor,
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TldrawUiButton
          type="icon"
          title="Canvas AI chat"
          aria-label="Canvas AI chat"
        >
          <MessageCircle className="size-4" />
        </TldrawUiButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="z-[1000] w-[22rem] gap-3 p-3"
      >
        <PopoverHeader className="gap-1">
          <PopoverTitle>Canvas AI</PopoverTitle>
          <PopoverDescription>
            Chat can see the budget numbers you send.
          </PopoverDescription>
        </PopoverHeader>

        {blocked ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Turn on Cloud Processing in Modules before sending ledger data to AI.
          </p>
        ) : null}

        <MessageGroup className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
          {messages.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">
              Try: “Draw a spend summary from my top merchants”
            </p>
          ) : (
            messages.map((message) => {
              const text = messageText(message.parts ?? []);
              if (!text) return null;
              const align = message.role === "user" ? "end" : "start";
              return (
                <Message key={message.id} align={align}>
                  <MessageContent>
                    <Bubble
                      align={align}
                      variant={message.role === "user" ? "default" : "secondary"}
                    >
                      <BubbleContent>{text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              );
            })
          )}
        </MessageGroup>

        {error ? (
          <p className="text-xs text-red-700">{error.message}</p>
        ) : null}

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
            placeholder="Ask or draw…"
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

export function CanvasQuickActions() {
  return (
    <DefaultQuickActions>
      <DefaultQuickActionsContent />
      <CanvasAiChat />
    </DefaultQuickActions>
  );
}
