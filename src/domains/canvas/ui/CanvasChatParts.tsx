"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  PiggyMascot,
  type PiggyMood,
} from "@/domains/ledger-ai/ui/PiggyMascot";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ReasoningUIPart, ToolUIPart } from "ai";
import {
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Eraser,
  Move,
  PencilLine,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
};

const FALLBACK_META: ToolMeta = {
  icon: PencilLine,
  preparing: "Working…",
  running: "Working…",
  done: "Done",
};

function countOf(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["count", "deleted"]) {
    if (typeof record[key] === "number") return record[key];
  }
  for (const key of ["elements", "ids", "createdIds", "updated"]) {
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
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs motion-safe:animate-piggy-pop",
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
        <Icon className="size-3 shrink-0 motion-safe:animate-piggy-idle" />
      )}
      <span className={cn("truncate", tone === "busy" && "shimmer")}>
        {label}
      </span>
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
        <Brain className="mt-0.5 size-3 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={cn("block font-medium", streaming && "shimmer")}>
            {header}
          </span>
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
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

const MARKDOWN_CLASSES =
  "space-y-2 [&_p]:leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_code]:rounded [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8em] [&_a]:underline [&_a]:underline-offset-2 [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_th]:font-semibold [&_td]:py-0.5 [&_hr]:border-border";

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className={MARKDOWN_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thinking indicator                                                  */
/* ------------------------------------------------------------------ */

const COIN_DELAYS = ["0ms", "150ms", "300ms"] as const;

/** Piggy + bouncing coins shown before the first assistant text arrives. */
export function PiggyThinking({
  label,
  mood = "think",
}: {
  label: string;
  mood?: PiggyMood;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 motion-safe:animate-piggy-pop"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle">
        <PiggyMascot mood={mood} iconClassName="size-3.5" />
      </span>
      <div className="flex items-center gap-2 rounded-xl border border-accent/15 bg-accent-subtle/70 px-3 py-2">
        <span className="text-xs text-accent shimmer">{label}</span>
        <span className="flex items-end gap-0.5" aria-hidden>
          {COIN_DELAYS.map((delay) => (
            <span
              key={delay}
              style={{ animationDelay: delay }}
              className="size-1.5 rounded-full bg-amber-400 ring-1 ring-amber-600/40 motion-safe:animate-piggy-coin"
            />
          ))}
        </span>
      </div>
    </div>
  );
}
