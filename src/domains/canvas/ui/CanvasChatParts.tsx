"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { isHttpUrl } from "@/domains/ledger-ai/domain/tidyPiggyMarkdown";
import { PiggyMarkdown } from "@/domains/ledger-ai/ui/PiggyMarkdown";
import { cn } from "@/lib/utils";
import type {
  DynamicToolUIPart,
  ReasoningUIPart,
  SourceUrlUIPart,
  ToolUIPart,
} from "ai";
import {
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Eraser,
  FileText,
  Globe,
  Landmark,
  LayoutTemplate,
  MessageCircle,
  Move,
  PencilLine,
  Scale,
  Search,
  Sigma,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

/** Collapse thoughts/stamps without yanking the bubble. Height + gap fold together. */
export function ScratchFold({
  hidden,
  children,
}: {
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={hidden}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:duration-0",
        hidden ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "mb-1.5 flex flex-col gap-1.5",
            hidden && "pointer-events-none",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tool activity                                                       */
/* ------------------------------------------------------------------ */

type ToolMeta = {
  icon: LucideIcon;
  /** Label while the model is still streaming the tool input. */
  preparing: string;
  /** Label while the tool runs. `{n}` is replaced with the element count. */
  running: string;
  /** Label once the tool finished. `{n}` is replaced with the result count. */
  done: string;
};

const TOOL_META: Record<string, ToolMeta> = {
  use_skeleton: {
    icon: LayoutTemplate,
    preparing: "Laying out the board…",
    running: "Stamping {n} shape(s)…",
    done: "Stamped {n} shape(s)",
  },
  create_shapes: {
    icon: PencilLine,
    preparing: "Sketching the next piece…",
    running: "Drawing {n} shape(s)…",
    done: "Drew {n} shape(s)",
  },
  update_shapes: {
    icon: Move,
    preparing: "Eyeing the board…",
    running: "Nudging {n} shape(s)…",
    done: "Updated {n} shape(s)",
  },
  delete_shapes: {
    icon: Eraser,
    preparing: "Picking what to erase…",
    running: "Erasing {n} shape(s)…",
    done: "Erased {n} shape(s)",
  },
  clear_page: {
    icon: Trash2,
    preparing: "Getting the eraser…",
    running: "Wiping the board…",
    done: "Board cleared",
  },
  say_bubble: {
    icon: MessageCircle,
    preparing: "Clearing throat…",
    running: "Speaking up…",
    done: "Said it out loud",
  },
  remember_about_user: {
    icon: Brain,
    preparing: "Making a note…",
    running: "Remembering…",
    done: "Noted for next time",
  },
  forget_about_user: {
    icon: Eraser,
    preparing: "Finding that note…",
    running: "Forgetting…",
    done: "Forgotten",
  },
  web_search: {
    icon: Globe,
    preparing: "Thinking of what to look up…",
    running: "Searching the web…",
    done: "Checked the web",
  },
  search_transactions: {
    icon: Search,
    preparing: "Deciding what to look for…",
    running: "Flipping through transactions…",
    done: "Found {n} transaction(s)",
  },
  summarize_spend: {
    icon: Sigma,
    preparing: "Picking what to total…",
    running: "Adding it up…",
    done: "Totals ready",
  },
  list_accounts: {
    icon: Landmark,
    preparing: "Checking your accounts…",
    running: "Listing accounts…",
    done: "Accounts in hand",
  },
  list_statements: {
    icon: FileText,
    preparing: "Reaching for statements…",
    running: "Reading statements…",
    done: "Read {n} statement(s)",
  },
  ask_jev: {
    icon: Scale,
    preparing: "Posing a vote…",
    running: "Asking Jev…",
    done: "Jev voted",
  },
  plan_board_with_jev: {
    icon: Scale,
    preparing: "Picking a layout…",
    running: "Asking Jev which board…",
    done: "Layout picked",
  },
};

const FALLBACK_META: ToolMeta = {
  icon: PencilLine,
  preparing: "Working…",
  running: "Working…",
  done: "Done",
};

function countOf(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) return value.length;
  const record = value as Record<string, unknown>;
  for (const key of ["count", "deleted"]) {
    if (typeof record[key] === "number") return record[key];
  }
  for (const key of ["elements", "ids", "createdIds", "updated", "matches"]) {
    const list = record[key];
    if (Array.isArray(list)) return list.length;
  }
  return null;
}

/** "Drew {n} shape(s)" -> "Drew 1 shape" / "Drew 3 shapes" / "Drew shapes". */
function fill(template: string, n: number | null) {
  const plural = n === null || n !== 1;
  const text = template.replace("(s)", plural ? "s" : "");
  if (n === null) return text.replace(" {n}", "").replace("{n} ", "");
  return text.replace("{n}", String(n));
}

export function toolNameFromPart(type: string) {
  return type.startsWith("tool-") ? type.slice("tool-".length) : type;
}

/** One row per tool call: what Piggy is doing on the board right now. */
export function ToolActivity({
  part,
  boardError,
}: {
  part: ToolUIPart | DynamicToolUIPart;
  /** Set when the server acknowledged the call but the board failed to apply it. */
  boardError?: string;
}) {
  const name =
    part.type === "dynamic-tool" ? part.toolName : toolNameFromPart(part.type);
  const meta = TOOL_META[name] ?? FALLBACK_META;
  const Icon = meta.icon;

  let label: string;
  let tone: "busy" | "done" | "error";
  switch (boardError ? "output-error" : part.state) {
    case "input-streaming":
      label = meta.preparing;
      tone = "busy";
      break;
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      label = fill(meta.running, countOf(part.input));
      tone = "busy";
      break;
    case "output-available":
      label = fill(meta.done, countOf(part.output) ?? countOf(part.input));
      tone = "done";
      break;
    case "output-error":
      label = "That stroke slipped";
      tone = "error";
      break;
    default:
      label = meta.running;
      tone = "busy";
  }

  return (
    <div
      data-tone={tone}
      title={
        boardError ??
        (part.state === "output-error" ? part.errorText : undefined)
      }
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
        tone === "busy" && "border-accent/20 bg-accent-subtle/50 text-accent",
        tone === "done" && "border-success/20 bg-success-subtle text-success",
        tone === "error" && "border-danger/20 bg-danger-subtle text-danger",
      )}
    >
      {tone === "done" ? (
        <Check className="size-3 shrink-0" strokeWidth={2.5} />
      ) : tone === "error" ? (
        <CircleAlert className="size-3 shrink-0" />
      ) : (
        <Icon className="size-3 shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reasoning                                                           */
/* ------------------------------------------------------------------ */

const PREVIEW_CHARS = 110;

/** One short line for the collapsed peek (latest thought while streaming). */
function thoughtPreview(text: string, preferLatest: boolean) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (!preferLatest) {
    if (cleaned.length <= PREVIEW_CHARS) return cleaned;
    return `${cleaned.slice(0, PREVIEW_CHARS).trimEnd()}…`;
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const latest = lines.at(-1) ?? cleaned;
  if (latest.length <= PREVIEW_CHARS) return latest;
  return `…${latest.slice(-(PREVIEW_CHARS - 1)).trimStart()}`;
}

/** Cursor/OpenAI-style: peek only, full text tucked behind expand. */
export function ReasoningBlock({ part }: { part: ReasoningUIPart }) {
  const [userOpen, setUserOpen] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);
  const streaming = part.state === "streaming";
  const open = userOpen;
  const text = part.text.trim();

  useEffect(() => {
    if (streaming || elapsedSec != null || !text) return;
    setElapsedSec(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
  }, [streaming, elapsedSec, text, startedAt]);

  if (!text && !streaming) return null;

  const preview = thoughtPreview(text, streaming);
  const header = streaming
    ? "Piggy is thinking…"
    : elapsedSec != null
      ? `Thought for ${elapsedSec}s`
      : "Piggy's thoughts";

  return (
    <Collapsible
      open={open}
      onOpenChange={setUserOpen}
      className="w-full max-w-[85%] rounded-lg border border-accent/15 bg-accent-subtle/30 text-xs"
    >
      <CollapsibleTrigger className="group/reason flex w-full items-start gap-1.5 px-2 py-1.5 text-left text-accent">
        <Brain
          className={cn(
            "mt-0.5 size-3 shrink-0",
            streaming && "motion-safe:animate-piggy-think",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{header}</span>
          {!open && preview ? (
            <span className="mt-0.5 block truncate font-normal text-muted-foreground">
              {preview}
            </span>
          ) : null}
        </span>
        <ChevronDown className="mt-0.5 size-3 shrink-0 transition-transform group-data-[state=open]/reason:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-2 text-muted-foreground data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <div className="max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed">
          {text || (streaming ? "…" : null)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/* Web sources                                                         */
/* ------------------------------------------------------------------ */

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Links Piggy cited from web_search, deduped by URL. */
export function SourceList({
  parts,
  onLocalRef,
}: {
  parts: SourceUrlUIPart[];
  onLocalRef?: (label: string) => boolean;
}) {
  const seen = new Set<string>();
  const sources = parts.filter((part) => {
    if (!part.url || seen.has(part.url)) return false;
    seen.add(part.url);
    return true;
  });
  if (sources.length === 0) return null;
  return (
    <div className="mt-1.5 flex max-w-[85%] flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Globe className="size-3" />
        Sources
      </span>
      {sources.map((source, index) => {
        const title = source.title?.trim() || hostOf(source.url);
        const className =
          "inline-flex max-w-48 items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 hover:border-accent/40 hover:text-accent";
        if (isHttpUrl(source.url)) {
          return (
            <a
              key={source.sourceId ?? source.url}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              title={source.title || source.url}
              className={className}
            >
              <span className="tabular-nums">{index + 1}</span>
              <span className="truncate">{title}</span>
            </a>
          );
        }
        return (
          <button
            key={source.sourceId ?? source.url}
            type="button"
            title={title}
            className={className}
            onClick={() => {
              onLocalRef?.(title);
            }}
          >
            <span className="tabular-nums">{index + 1}</span>
            <span className="truncate">{title}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

export function AssistantMarkdown({
  text,
  onLocalRef,
}: {
  text: string;
  onLocalRef?: (label: string) => boolean;
}) {
  return <PiggyMarkdown text={text} onLocalRef={onLocalRef} />;
}

/* ------------------------------------------------------------------ */
/* Thinking indicator                                                  */
/* ------------------------------------------------------------------ */

/** Compact status before the first assistant part arrives. Only the brain moves. */
export function PiggyThinking({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex w-fit max-w-[85%] items-center gap-1.5 rounded-lg border border-accent/15 bg-accent-subtle/30 px-2 py-1.5 text-xs text-accent"
    >
      <Brain className="size-3 shrink-0 motion-safe:animate-piggy-think" />
      <span className="font-medium">{label}</span>
    </div>
  );
}
