"use client";

import { ChromeTab, ChromeTabStrip } from "@/components/layout/ChromeTab";
import { DockPanelResizeGrip } from "@/components/layout/DockPanelResizeGrip";
import {
  DOCK_PANEL_DEFAULT_WIDTH,
  useDockPanelSize,
  type DockPanelAnchor,
  type DockPanelSize,
} from "@/components/layout/useDockPanelSize";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
  addPiggyDocuments,
  documentsToFileParts,
  filesFromDataTransfer,
  imagesFromClipboard,
} from "@/domains/ledger-ai/application/attachDocuments";
import {
  APPLY_BUDGET_EDIT_TOOL_NAME,
  type ApplyBudgetEditOutput,
} from "@/domains/ledger-ai/domain/applyBudgetEditTool";
import {
  ASK_USER_TOOL_NAME,
  type AskUserOutput,
} from "@/domains/ledger-ai/domain/askUserTool";
import {
  EXPORT_FILE_TOOL_NAME,
  type ExportFileOutput,
} from "@/domains/ledger-ai/domain/exportFileTool";
import {
  IMPORT_STATEMENT_DOCUMENT_TOOL_NAME,
  type ImportStatementDocumentOutput,
} from "@/domains/ledger-ai/domain/importStatementDocumentTool";
import { earlierDocumentNote } from "@/domains/ledger-ai/domain/piggyDocuments";
import {
  isApplyBudgetEditPart,
  isAskUserPart,
  isExportFilePart,
  isImportStatementDocumentPart,
  isPiggyCardPart,
  isRegisterLoanFromDocumentPart,
  isShowSketchPart,
  isVaultLedgerWritePart,
  vaultLedgerWriteToolName,
  type PiggyUIMessage,
  type VaultLedgerWriteToolName,
} from "@/domains/ledger-ai/domain/piggyUiMessage";
import {
  REGISTER_LOAN_FROM_DOCUMENT_TOOL_NAME,
  type RegisterLoanFromDocumentOutput,
} from "@/domains/ledger-ai/domain/registerLoanFromDocumentTool";
import { PiggyApplyBudgetEdit } from "@/domains/ledger-ai/ui/PiggyApplyBudgetEdit";
import { PiggyAttachment } from "@/domains/ledger-ai/ui/PiggyAttachment";
import {
  PiggyPendingDocuments,
  PiggySentDocuments,
} from "@/domains/ledger-ai/ui/PiggyDocumentChips";
import { PiggyFeatureCarousel } from "@/domains/ledger-ai/ui/PiggyFeatureCarousel";
import { PiggyIdlePrompt } from "@/domains/ledger-ai/ui/PiggyIdlePrompt";
import { PiggyImportStatement } from "@/domains/ledger-ai/ui/PiggyImportStatement";
import { PiggyInlineSketch } from "@/domains/ledger-ai/ui/PiggyInlineSketch";
import {
  piggyMoodFromChat,
  piggyMoodFromMessage,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import {
  PiggyQuestionnaire,
  PiggyQuestionnaireAnswers,
} from "@/domains/ledger-ai/ui/PiggyQuestionnaire";
import { PiggyRegisterLoan } from "@/domains/ledger-ai/ui/PiggyRegisterLoan";
import {
  PiggyAssistantMessage,
  PiggyCappedText,
  PiggyTextBubble,
  PiggyTranscript,
  PiggyTranscriptItem,
  PiggyUserMessage,
} from "@/domains/ledger-ai/ui/PiggyTranscript";
import { PiggyVaultLedgerWrite } from "@/domains/ledger-ai/ui/PiggyVaultLedgerWrite";
import { useScratchNote } from "@/domains/scratch-note/scratchNoteStore";
import { OCR_DOCUMENT_ACCEPT } from "@/domains/statements/domain/ocrDocumentTypes";
import { dashboardFromPrivateLedger } from "@/domains/vault/application/dashboardFromPrivateLedger";
import { usePrivateLedger } from "@/domains/vault/ui/usePrivateLedger";
import { cn } from "@/lib/utils";
import { logAiUsageFromMessageMetadata } from "@/shared/debug/aiUsageDebug";
import { errorMessage } from "@/shared/lib/error-message";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { Info, Paperclip, PlusIcon, SendHorizonal, Square } from "lucide-react";
import type { ComponentProps } from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { toast } from "sonner";
import {
  emptyPiggyHistory,
  restorePiggyChatIndex,
  restorePiggyHistory,
  type PiggyChatIndex,
  type PiggyHistory,
} from "../domain/piggyHistory";
import { usePiggyHistory } from "./usePiggyHistory";

const MAX_PIGGY_TABS = 8;
const PIGGY_PANEL_DEFAULT_SIZE: DockPanelSize = {
  width: DOCK_PANEL_DEFAULT_WIDTH,
  bodyHeight: 21.3 * 16,
};
/** Same shell as the fab's docked panels, so the chat hugs the right edge under the pill. */
const LEDGER_AI_DOCK_PANEL =
  "pointer-events-auto max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-background shadow-lg ring-1 ring-border/40 max-md:w-[calc(100vw-1.5rem)]";
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
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-accent hover:text-primary"
          aria-label="About Piggy"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-3.5"
      >
        <PopoverHeader className="gap-1">
          <PopoverTitle>Piggy</PopoverTitle>
          <PopoverDescription>
            A financial advisor mascot who works from your budget numbers.
          </PopoverDescription>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            <li>Scroll past the last reply to clear this chat</li>
          </ul>
        </PopoverHeader>
        <PiggyFeatureCarousel className="mt-3" />
      </PopoverContent>
    </Popover>
  );
}

function PiggyChatPane(
  props: Omit<
    ComponentProps<typeof PiggyChatPaneSession>,
    "initialHistory" | "saveHistory"
  >,
) {
  const history = usePiggyHistory(
    `ledger:${props.chatId}`,
    restorePiggyHistory,
  );
  return (
    <>
      {history.error && (
        <p role="status" className="px-3 py-2 text-xs text-warning">
          {history.error}
        </p>
      )}
      {history.ready ? (
        <PiggyChatPaneSession
          key={`${history.owner}:${props.chatId}`}
          {...props}
          initialHistory={history.initial!}
          saveHistory={history.save}
        />
      ) : (
        <p className="p-3 text-xs text-muted-foreground">Loading saved chat…</p>
      )}
    </>
  );
}

function PiggyChatPaneSession({
  chatId,
  tabName,
  active,
  open,
  blocked,
  transport,
  transcriptHeight,
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
  /** Pixel height of the message list; the user drags the panel grip to change it. */
  transcriptHeight: number;
  onMoodChange?: (mood: PiggyMood) => void;
}) {
  const [input, setInput] = useState(initialHistory.draft);
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipAutoSend = useRef(false);

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    addToolResult,
    stop,
  } = useChat<PiggyUIMessage>({
    id: chatId,
    messages: initialHistory.messages as PiggyUIMessage[],
    throttle: 250,
    transport,
    // ask_user has no server execute: once the user answers in the card,
    // resume the model with the tool output. Skip that resume when the
    // user types a new message instead of filling the questionnaire.
    sendAutomaticallyWhen: (options) => {
      if (skipAutoSend.current) return false;
      return lastAssistantMessageIsCompleteWithToolCalls(options);
    },
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
    // File parts hold data URLs; never persist those to localStorage.
    const slim = messages.map((message) => ({
      ...message,
      parts: message.parts.filter((part) => part.type !== "file"),
    }));
    saveHistory({ ...emptyPiggyHistory(), messages: slim, draft: input });
  }, [input, messages, saveHistory]);

  const clearChat = () => {
    void stop();
    setMessages([]);
    setInput("");
    setPendingFiles([]);
    saveHistory(emptyPiggyHistory());
  };

  const attachFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    const { files, rejected } = addPiggyDocuments(pendingFiles, incoming);
    setPendingFiles(files);
    for (const reason of rejected)
      toast.warning("Skipped a file", { description: reason });
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    if (!dragging) setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null))
      return;
    setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    attachFiles(filesFromDataTransfer(event.dataTransfer));
  };
  const busy = status === "submitted" || status === "streaming";
  const lastMessage = messages.at(-1);
  const pendingAsks =
    !busy && lastMessage?.role === "assistant"
      ? lastMessage.parts.filter(
          (part) => isAskUserPart(part) && part.state === "input-available",
        )
      : [];
  const awaitingAnswer = pendingAsks.length > 0;
  // Ctrl+V a screenshot anywhere in the pane; text pastes fall through to the input.
  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (busy || blocked || attaching) return;
    const images = imagesFromClipboard(event.clipboardData);
    if (images.length === 0) return;
    event.preventDefault();
    attachFiles(images);
  };
  const answerAsk = (toolCallId: string, output: AskUserOutput) =>
    void addToolResult({ tool: ASK_USER_TOOL_NAME, toolCallId, output });
  const reportExport = (toolCallId: string, output: ExportFileOutput) =>
    void addToolResult({ tool: EXPORT_FILE_TOOL_NAME, toolCallId, output });
  const reportBudgetEdit = (
    toolCallId: string,
    output: ApplyBudgetEditOutput,
  ) =>
    void addToolResult({
      tool: APPLY_BUDGET_EDIT_TOOL_NAME,
      toolCallId,
      output,
    });
  const reportStatementImport = (
    toolCallId: string,
    output: ImportStatementDocumentOutput,
  ) =>
    void addToolResult({
      tool: IMPORT_STATEMENT_DOCUMENT_TOOL_NAME,
      toolCallId,
      output,
    });
  const reportLoanRegister = (
    toolCallId: string,
    output: RegisterLoanFromDocumentOutput,
  ) =>
    void addToolResult({
      tool: REGISTER_LOAN_FROM_DOCUMENT_TOOL_NAME,
      toolCallId,
      output,
    });
  const reportVaultWrite = (
    tool: VaultLedgerWriteToolName,
    toolCallId: string,
    output: unknown,
  ) =>
    void addToolResult({
      tool,
      toolCallId,
      output,
    } as never);
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
    <div
      className="relative flex flex-col"
      hidden={!active}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      {dragging ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent-subtle/80 text-sm font-medium text-accent"
        >
          Drop a statement, loan document, or receipt for {tabName}
        </div>
      ) : null}
      {blocked ? (
        <p className="border-b border-border bg-warning-subtle px-3 py-2 text-xs text-warning">
          Turn on Cloud Processing in Modules before sending budget data to
          Piggy.
        </p>
      ) : null}

      <PiggyTranscript
        ariaLabel={`${tabName} conversation`}
        style={{ height: transcriptHeight }}
        onClearChat={clearChat}
        canClearChat={messages.length > 0 || !!error}
      >
        {messages.length === 0 ? (
          <PiggyTranscriptItem messageId="piggy-empty">
            <PiggyAssistantMessage mood="happy">
              <PiggyTextBubble>
                <PiggyIdlePrompt />
              </PiggyTextBubble>
            </PiggyAssistantMessage>
          </PiggyTranscriptItem>
        ) : (
          messages.map((message) => {
            const text = messageText(message.parts ?? []);
            const cards = message.parts.filter(isPiggyCardPart);
            const files = message.parts.flatMap((part) =>
              part.type === "file"
                ? [
                    {
                      filename: part.filename ?? "document",
                      mediaType: part.mediaType,
                    },
                  ]
                : [],
            );
            if (!text && cards.length === 0 && files.length === 0) return null;
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
                  <PiggyUserMessage text={text}>
                    <PiggySentDocuments files={files} />
                  </PiggyUserMessage>
                ) : (
                  <PiggyAssistantMessage
                    mood={
                      assistantTalking ? mood : piggyMoodFromMessage(message)
                    }
                  >
                    {text ? (
                      <PiggyTextBubble>
                        <PiggyCappedText
                          text={text}
                          live={!bornMessageIds.current.has(message.id)}
                        />
                      </PiggyTextBubble>
                    ) : null}
                    {cards.map((part) => {
                      if (isExportFilePart(part)) {
                        if (
                          part.state !== "input-available" &&
                          part.state !== "output-available"
                        ) {
                          return null;
                        }
                        return (
                          <PiggyAttachment
                            key={part.toolCallId}
                            input={part.input}
                            pending={part.state === "input-available"}
                            onBuilt={(output) =>
                              reportExport(part.toolCallId, output)
                            }
                          />
                        );
                      }
                      if (isShowSketchPart(part)) {
                        if (
                          part.state !== "input-available" &&
                          part.state !== "output-available"
                        ) {
                          return null;
                        }
                        return (
                          <PiggyInlineSketch
                            key={part.toolCallId}
                            input={part.input}
                          />
                        );
                      }
                      if (isApplyBudgetEditPart(part)) {
                        if (
                          part.state !== "input-available" &&
                          part.state !== "output-available"
                        ) {
                          return null;
                        }
                        return (
                          <PiggyApplyBudgetEdit
                            key={part.toolCallId}
                            input={part.input}
                            pending={part.state === "input-available"}
                            onDone={(output) =>
                              reportBudgetEdit(part.toolCallId, output)
                            }
                          />
                        );
                      }
                      if (isImportStatementDocumentPart(part)) {
                        if (part.state !== "input-available") return null;
                        return (
                          <PiggyImportStatement
                            key={part.toolCallId}
                            input={part.input}
                            pending
                            messages={messages}
                            onDone={(output) =>
                              reportStatementImport(part.toolCallId, output)
                            }
                          />
                        );
                      }
                      if (isRegisterLoanFromDocumentPart(part)) {
                        if (part.state !== "input-available") return null;
                        return (
                          <PiggyRegisterLoan
                            key={part.toolCallId}
                            input={part.input}
                            pending
                            messages={messages}
                            onDone={(output) =>
                              reportLoanRegister(part.toolCallId, output)
                            }
                          />
                        );
                      }
                      if (isVaultLedgerWritePart(part)) {
                        if (part.state !== "input-available") return null;
                        const toolName = vaultLedgerWriteToolName(part);
                        return (
                          <PiggyVaultLedgerWrite
                            key={part.toolCallId}
                            toolName={toolName}
                            input={part.input}
                            pending
                            onDone={(output) =>
                              reportVaultWrite(
                                toolName,
                                part.toolCallId,
                                output,
                              )
                            }
                          />
                        );
                      }
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
                          onSubmit={(output) =>
                            answerAsk(part.toolCallId, output)
                          }
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
        {busy &&
        (status === "submitted" ||
          lastMessage?.role !== "assistant" ||
          !messageText(lastMessage?.parts ?? [])) ? (
          <PiggyTranscriptItem messageId="piggy-thinking">
            <PiggyAssistantMessage mood="thinking">
              <p role="status" className="py-2 text-xs text-muted-foreground">
                Piggy is thinking…
              </p>
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

      <div className="border-t border-border bg-surface">
        <PiggyPendingDocuments
          files={pendingFiles}
          disabled={attaching}
          onRemove={(index) =>
            setPendingFiles((current) => current.filter((_, i) => i !== index))
          }
        />
        <form
          className="flex items-center gap-1.5 p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const value = input.trim();
            const hasFiles = pendingFiles.length > 0;
            if ((!value && !hasFiles) || busy || blocked || attaching) return;
            let files;
            if (hasFiles) {
              setAttaching(true);
              try {
                files = await documentsToFileParts(pendingFiles);
              } catch (err) {
                toast.error("Could not read a file", {
                  description: errorMessage(err, "Try attaching it again"),
                });
                setAttaching(false);
                return;
              }
              setAttaching(false);
            }
            if (pendingAsks.length > 0) {
              skipAutoSend.current = true;
              for (const part of pendingAsks) {
                await addToolResult({
                  tool: ASK_USER_TOOL_NAME,
                  toolCallId: part.toolCallId,
                  output: { answers: [], dismissed: true },
                });
              }
            }
            void sendMessage({
              text: value || "Here is a document.",
              files,
            });
            if (pendingAsks.length > 0) {
              window.setTimeout(() => {
                skipAutoSend.current = false;
              }, 0);
            }
            setInput("");
            setPendingFiles([]);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={OCR_DOCUMENT_ACCEPT}
            multiple
            hidden
            onChange={(event) => {
              attachFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <InputGroup className="h-8 min-w-0 flex-1 items-center">
            <InputGroupInput
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={
                busy
                  ? "Piggy is busy…"
                  : awaitingAnswer
                    ? "Type to interrupt, or answer above"
                    : pendingFiles.length > 0
                      ? "Say what to do with it, or just send"
                      : `Ask ${tabName}…`
              }
              disabled={blocked}
              className="h-8"
            />
            <InputGroupAddon align="inline-end" className="self-center">
              {busy ? (
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  variant="default"
                  onClick={() => void stop()}
                  aria-label="Stop Piggy"
                  className="size-6 rounded-full"
                >
                  <Square className="size-3 fill-current" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  size="icon-xs"
                  variant="default"
                  disabled={
                    blocked ||
                    attaching ||
                    (!input.trim() && pendingFiles.length === 0)
                  }
                  aria-label="Send"
                  className="size-6 rounded-full"
                >
                  <SendHorizonal className="size-3.5" />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Attach a document"
            title="Attach a statement, loan document, or receipt. You can also paste a screenshot."
            disabled={busy || blocked || attaching}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export function LedgerAiChat(
  props: Omit<
    ComponentProps<typeof LedgerAiChatSession>,
    "initialIndex" | "saveIndex" | "historyError"
  >,
) {
  const history = usePiggyHistory("ledger-index", restorePiggyChatIndex);
  if (!props.open) return null;
  if (!history.ready)
    return (
      <div
        className={`${LEDGER_AI_DOCK_PANEL} p-3`}
        style={{ width: PIGGY_PANEL_DEFAULT_SIZE.width }}
      >
        <p className="text-xs text-muted-foreground">
          Loading saved Piggy chats…
        </p>
      </div>
    );
  return (
    <LedgerAiChatSession
      key={history.owner}
      {...props}
      initialIndex={history.initial!}
      saveIndex={history.save}
      historyError={history.error}
    />
  );
}

function LedgerAiChatSession({
  open,
  anchor = "bottom-right",
  onMoodChange,
  initialIndex,
  saveIndex,
  historyError,
}: {
  historyError?: string;
  initialIndex: PiggyChatIndex;
  saveIndex: (value: PiggyChatIndex) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screen corner the panel is docked to; the resize grip sits on the opposite corner. */
  anchor?: DockPanelAnchor;
  onMoodChange?: (mood: PiggyMood) => void;
}) {
  const [tabs, setTabs] = useState<PiggyTab[]>(initialIndex.tabs);
  const [activeId, setActiveId] = useState(initialIndex.activeId);
  const panelSize = useDockPanelSize({
    storageKey: "piggy-chat-panel-size",
    defaultSize: PIGGY_PANEL_DEFAULT_SIZE,
    anchor,
  });
  useEffect(() => {
    saveIndex({ tabs, activeId });
  }, [tabs, activeId, saveIndex]);
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
          // Only the newest user message carries file bytes; older ones keep
          // a text note so the request stays small and the context stays clear.
          const lastUserIndex = messages.findLastIndex(
            (m) => m.role === "user",
          );
          const slimMessages = messages.map((message, index) =>
            index === lastUserIndex ||
            !message.parts.some((p) => p.type === "file")
              ? message
              : {
                  ...message,
                  parts: message.parts.map((part) =>
                    part.type === "file"
                      ? {
                          type: "text" as const,
                          text: earlierDocumentNote(
                            part.filename ?? "document",
                          ),
                        }
                      : part,
                  ),
                },
          );
          return {
            body: {
              ...body,
              id,
              messages: slimMessages,
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
    <div
      className={cn(
        LEDGER_AI_DOCK_PANEL,
        "relative",
        panelSize.resizing && "select-none",
      )}
      style={{ width: panelSize.size.width }}
    >
      <DockPanelResizeGrip label="Piggy panel" resize={panelSize} />
      <div className="relative border-b border-border bg-muted/25">
        <ChromeTabStrip ariaLabel="Piggy chats">
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
          <div className="mb-1 ml-0.5 flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Add Piggy tab"
              title={
                tabs.length >= MAX_PIGGY_TABS
                  ? `Up to ${MAX_PIGGY_TABS} chats`
                  : "Add tab"
              }
              disabled={tabs.length >= MAX_PIGGY_TABS}
              className="inline-flex size-5 shrink-0 touch-manipulation items-center justify-center rounded-sm text-accent max-md:size-8 hover:bg-accent-subtle hover:text-accent disabled:pointer-events-none disabled:opacity-40"
              onClick={addTab}
            >
              <PlusIcon className="size-3" strokeWidth={2} />
            </button>
            <PiggyAboutInfo />
          </div>
        </ChromeTabStrip>
      </div>
      <p className="sr-only">
        Ask for money advice from your numbers, or change your own budget, store
        sheet, and notes. Recategorize transactions, edit sections and
        categories, or summarize spend. Each tab is a separate chat.
      </p>

      {historyError && (
        <p role="status" className="px-3 py-2 text-xs text-warning">
          {historyError}
        </p>
      )}
      {tabs.map((tab) => (
        <PiggyChatPane
          key={tab.id}
          chatId={tab.id}
          tabName={tab.name}
          active={tab.id === activeId}
          open={open}
          blocked={blocked}
          transport={transport}
          transcriptHeight={panelSize.size.bodyHeight}
          onMoodChange={onMoodChange}
        />
      ))}
    </div>
  );
}
